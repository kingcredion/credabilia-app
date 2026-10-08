import Stripe from 'npm:stripe@17';

// Stripe calls this endpoint directly with its own Stripe-Signature header, not a Supabase
// user JWT -- there is no end-user session to scope RLS to, so this is the one function in
// the project that deliberately uses a service-role client. Every write still goes through
// the same narrowly-granted service_role-only functions, never a raw table write.
export function createHandler({createClient,env}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'stripe-signature, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
  // Best-effort email to the operator (kingcredion@credabilia.com) when money moved but we could not record it. Never throws.
  const alertOperator=async(client,props)=>{try{await client.rpc('notify_operator_alert',{p_event:'Admin Alert: Payment Problem',p_properties:props});}catch{}};
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
    let client,object,event;
    try {
      if(!env('STRIPE_SECRET_KEY') || !env('STRIPE_WEBHOOK_SECRET')) return reply({error:'Webhook is not connected yet.'},503);
      const signature=request.headers.get('Stripe-Signature');
      const body=await request.text();
      if(!signature) return reply({error:'Missing signature.'},400);

      const stripe=new Stripe(env('STRIPE_SECRET_KEY'),{apiVersion:'2024-06-20',httpClient:Stripe.createFetchHttpClient()});
      // Two Stripe event destinations point at this same URL (account-scope checkout events,
      // and connected-account-scope account.updated events) -- each has its own signing
      // secret, so STRIPE_WEBHOOK_SECRET may be a comma-separated list; try each in turn.
      const secrets=(env('STRIPE_WEBHOOK_SECRET')||'').split(',').map(value=>value.trim()).filter(Boolean);
      for(const secret of secrets) {
        try { event=await stripe.webhooks.constructEventAsync(body,signature,secret,undefined,Stripe.createSubtleCryptoProvider()); break; }
        catch {}
      }
      if(!event) return reply({error:'Invalid signature.'},400);

      client=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'));
      object=event.data.object;
      let result;
      if(event.type==='charge.dispute.created' || event.type==='charge.dispute.updated' || event.type==='charge.dispute.closed') {
        // A cardholder disputed a payment. A failure to record it is worth a retry from Stripe, so it answers 500.
        const recorded=await handleDispute(client,stripe,event.type,object,alertOperator);
        return recorded ? reply({received:true}) : reply({error:'Webhook handling failed.'},500);
      }
      if((event.type==='checkout.session.completed' || event.type==='checkout.session.expired') && object.mode==='setup') {
        // A member saved a card to be allowed to bid (nothing was charged). It is not an order, so it never goes near the order code.
        if(event.type==='checkout.session.completed') await recordBidCard(client,stripe,object,alertOperator);
        return reply({received:true});
      }
      if(event.type==='checkout.session.completed') {
        if(object.payment_status!=='paid') return reply({received:true});
        result=await client.rpc('finalize_checkout_session',{p_stripe_session_id:object.id,p_stripe_payment_intent_id:object.payment_intent});
      } else if(event.type==='checkout.session.expired') {
        result=await client.rpc('expire_checkout_session',{p_stripe_session_id:object.id});
      } else if(event.type==='account.updated') {
        result=await client.rpc('update_stripe_account_status',{p_stripe_account_id:object.id,p_charges_enabled:object.charges_enabled,p_details_submitted:object.details_submitted});
      }
      if(result?.error) {
        if(event.type==='checkout.session.completed') await alertOperator(client,{summary:'A customer paid, but the order could not be recorded.',reference:object.id,detail:String(result.error.message||'').slice(0,300)});
        return reply({error:'Webhook handling failed.'},500);
      }
      // Best effort, never affects the webhook's result: remember which card / bank account this member used, so a banned
      // member's payment details can be recognised on a new account.
      if(event.type==='checkout.session.completed') {
        await recordPurchaseTax(client,object,result?.data);
        await recordCardFingerprint(client,stripe,object,result?.data,alertOperator);
      }
      else if(event.type==='account.updated') await recordBankFingerprints(client,object,alertOperator);
      return reply({received:true});
    } catch {
      if(client && event?.type==='checkout.session.completed') await alertOperator(client,{summary:'A customer paid, but the order could not be recorded.',reference:object?.id,detail:'The webhook crashed while handling the payment.'});
      return reply({error:'Webhook handling failed.'},500);
    }
  };
}

// Remembers how much sales tax a paid order carried (0 when tax is off) and what the buyer was charged in total, so a partial refund can give
// back the right share. Best effort: never fails the webhook.
async function recordPurchaseTax(client, session, purchaseId) {
  try {
    if(!purchaseId) return;
    const tax=Number(session.total_details?.amount_tax||0), total=Number.isFinite(Number(session.amount_total))?Number(session.amount_total):null;
    if(!tax) return;
    await client.rpc('record_purchase_tax',{p_purchase_id:purchaseId,p_tax_cents:tax,p_charged_cents:total});
  } catch {}
}

// Records the card a member saved to be allowed to bid. A card already tied to a banned member does not count and alerts the operator.
// Best effort: a failure here never fails the webhook (the member can simply save a card again).
async function recordBidCard(client, stripe, session, alertOperator) {
  try {
    const userId=session.client_reference_id;
    if(!userId || !session.setup_intent) return;
    const setup=await stripe.setupIntents.retrieve(session.setup_intent,{expand:['payment_method']});
    const fingerprint=setup.payment_method?.card?.fingerprint;
    if(!fingerprint) return;
    const {data,error}=await client.rpc('record_bid_card',{p_user_id:userId,p_fingerprint:fingerprint});
    if(error) await alertOperator(client,{summary:'A member saved a card to bid, but it could not be recorded.',reference:session.id,detail:String(error.message||'').slice(0,300)});
    else if(data?.blocked) await alertOperator(client,{summary:'A member tried to bid with a card tied to a banned member.',reference:session.id,detail:'Member '+userId});
  } catch {}
}

// Records the card fingerprint of a paid order. A card already tied to a banned member holds that one order for review.
async function recordCardFingerprint(client, stripe, session, purchaseId, alertOperator) {
  try {
    if(!purchaseId || !session.payment_intent) return;
    const intent=await stripe.paymentIntents.retrieve(session.payment_intent,{expand:['latest_charge','payment_method']});
    // The charge normally carries the card's fingerprint; a wallet or Link payment can leave it off the charge but still have it on the payment method.
    const fingerprint=intent.latest_charge?.payment_method_details?.card?.fingerprint || intent.payment_method?.card?.fingerprint;
    if(!fingerprint) { console.error('card fingerprint unavailable for order',purchaseId,'payment type',intent.latest_charge?.payment_method_details?.type); return; }
    const {data:purchase}=await client.from('purchases').select('buyer_id').eq('id',purchaseId).maybeSingle();
    if(!purchase) return;
    const {data}=await client.rpc('record_payment_fingerprint',{p_user_id:purchase.buyer_id,p_kind:'card',p_fingerprint:fingerprint,p_purchase_id:purchaseId});
    if(data?.blocked) await alertOperator(client,{summary:'A payment came from a card tied to a banned member. The order is on hold.',reference:session.id,detail:'Purchase '+purchaseId});
  } catch(error) {
    // Never fails the webhook, but is no longer silent: a card that could not be checked is something the operator should know about.
    console.error('card fingerprint check failed',session?.id,error?.message);
    try { await alertOperator(client,{summary:'A paid order could not be checked against banned cards.',reference:session?.id,detail:'Purchase '+purchaseId+'. '+String(error?.message||'').slice(0,200)}); } catch {}
  }
}

// Records the bank-account fingerprints on a seller's Stripe account. A bank account already tied to a banned member flags the
// seller's payouts for review.
async function recordBankFingerprints(client, account, alertOperator) {
  try {
    const fingerprints=(account.external_accounts?.data||[]).map(entry=>entry.fingerprint).filter(Boolean);
    if(!fingerprints.length) return;
    const {data:row}=await client.from('stripe_accounts').select('user_id').eq('stripe_account_id',account.id).maybeSingle();
    if(!row) return;
    for(const fingerprint of fingerprints) {
      const {data}=await client.rpc('record_payment_fingerprint',{p_user_id:row.user_id,p_kind:'bank',p_fingerprint:fingerprint});
      if(data?.blocked) await alertOperator(client,{summary:'A seller connected a bank account tied to a banned member. Their payouts are on hold.',reference:account.id,detail:'Member '+row.user_id});
    }
  } catch {}
}

// A card chargeback. It is recorded (which holds the order and, if the seller was already paid, freezes their payouts), the operator is
// told, and the evidence we already have is saved to the dispute as a DRAFT -- it is never submitted automatically, because Stripe allows
// one submission and a person should read it first. Nothing here moves money. Returns false only when the dispute could not be recorded.
async function handleDispute(client, stripe, type, dispute, alertOperator) {
  try {
    const payload={id:dispute.id,payment_intent:typeof dispute.payment_intent==='string'?dispute.payment_intent:dispute.payment_intent?.id,charge:typeof dispute.charge==='string'?dispute.charge:dispute.charge?.id,
      amount:dispute.amount,reason:dispute.reason,status:dispute.status,evidence_due_by:dispute.evidence_details?.due_by!=null?String(dispute.evidence_details.due_by):null};
    const {data,error}=await client.rpc('record_stripe_dispute',{p_dispute:payload});
    if(error) { console.error('dispute not recorded',dispute.id,error.message); await alertOperator(client,{summary:'A card chargeback was filed but could not be recorded.',reference:dispute.id,detail:String(error.message||'').slice(0,300)}); return false; }
    const dollars=Number.isFinite(Number(dispute.amount))?'$'+(Number(dispute.amount)/100).toFixed(2):'unknown amount';
    const due=dispute.evidence_details?.due_by?new Date(dispute.evidence_details.due_by*1000).toISOString().slice(0,10):'unknown';
    if(type==='charge.dispute.closed') {
      await alertOperator(client,{summary:'A card chargeback was closed: '+(dispute.status==='won'?'we won it.':dispute.status==='lost'?'we lost it.':dispute.status+'.'),reference:dispute.id,
        detail:dollars+', reason '+dispute.reason+(data?.purchase_id?'. Order '+data.purchase_id+' stays on hold until you clear it in the Risk tab.':'. No matching order was found.')});
      return true;
    }
    if(type==='charge.dispute.created') {
      let saved=false;
      if(data?.purchase_id && data.open) {
        try {
          const {data:packet}=await client.rpc('dispute_evidence_packet',{p_purchase_id:data.purchase_id});
          if(packet) { await stripe.disputes.update(dispute.id,{evidence:buildDisputeEvidence(packet),submit:false}); saved=true; await client.rpc('mark_dispute_progress',{p_stripe_dispute_id:dispute.id,p_evidence_saved:true,p_transfer_reversed:false}); }
        } catch(error) { console.error('dispute evidence not saved',dispute.id,error?.message); }
      }
      await alertOperator(client,{summary:'A card chargeback was filed on an order.',reference:dispute.id,
        detail:dollars+', reason '+dispute.reason+', respond by '+due+'. '+(data?.purchase_id?'Order '+data.purchase_id+' is on hold.':'No matching order was found.')
          +(data?.seller_already_paid?' The seller was already paid, so their payouts are frozen; consider reversing transfer '+(data.transfer_id||'(unknown)')+' in Stripe.':'')
          +(saved?' A draft of the evidence is saved in Stripe: review it and submit it.':' Evidence could not be drafted automatically: build it in Stripe.')});
    }
    return true;
  } catch(error) {
    console.error('dispute handling failed',dispute?.id,error?.message);
    try { await alertOperator(client,{summary:'A card chargeback could not be processed.',reference:dispute?.id,detail:String(error?.message||'').slice(0,300)}); } catch {}
    return false;
  }
}

// Turns our own records for an order into the fields Stripe asks for in a dispute. Text only; every field is capped well under Stripe's limits.
function buildDisputeEvidence(p) {
  const cap=(value,max=19000)=>String(value||'').slice(0,max);
  const day=value=>value?new Date(value).toISOString().slice(0,10):undefined;
  const a=p.shipping_address||{};
  const address=[a.name,a.street1,a.street2,[a.city,a.state,a.zip].filter(Boolean).join(' '),a.country].filter(Boolean).join(', ');
  const lines=[
    'Order for "'+p.title+'" ('+p.category+'), $'+(Number(p.price_cents)/100).toFixed(2)+', placed '+(day(p.purchased_at)||'')+'.',
    p.fulfillment_method==='pickup'
      ? 'Local pickup at a safe-trade location.'+(p.handoff_verified_at?' The seller entered the buyer\'s private handoff code on '+day(p.handoff_verified_at)+', which only the buyer has.':'')
      : (p.tracking_number?'Shipped '+(day(p.shipped_at)||'')+' with '+(p.shipping_provider||'the carrier')+' tracking '+p.tracking_number+'.':'')+(p.delivered_at?' Carrier tracking marked it delivered on '+day(p.delivered_at)+' to '+address+'.':' Carrier tracking has not yet marked it delivered.'),
    p.signature_required?'A delivery signature was required for this order.':'',
    p.inspection_accepted_at?'The buyer inspected the item and accepted it on '+day(p.inspection_accepted_at)+'.':'',
    p.disclosure_text?'Before paying, the buyer was shown this notice and confirmed it on '+(day(p.disclosure_acknowledged_at)||'the order date')+' (version '+p.disclosure_version+'): "'+p.disclosure_text+'"':'',
    p.certificate_issuer?'Certificate details entered by the seller: issuer '+p.certificate_issuer+', number '+p.certificate_number+'.':'No certificate of authenticity was listed, and the listing said so.',
    p.seller_attested_at?'The seller confirmed on '+day(p.seller_attested_at)+' that the item is authentic and any certificate attached is genuine.':'',
    'Credabilia is a marketplace: '+p.credibility_note,
    'The buyer sent the seller '+p.buyer_message_count+' message(s) through the app and opened '+p.refund_request_count+' refund request(s) before the dispute.',
  ].filter(Boolean);
  const evidence={
    product_description:cap('"'+p.title+'" — '+p.description),
    customer_name:cap(p.buyer_name,200),customer_email_address:cap(p.buyer_email,200),
    refund_policy_disclosure:'Buyers can request a refund in the app during the inspection period after delivery. Payment is held until the buyer has had that time to inspect the item; see the Terms of Service, section 8.',
    uncategorized_text:cap(lines.join('\n')),
  };
  if(p.fulfillment_method!=='pickup' && p.tracking_number) {
    evidence.shipping_tracking_number=cap(p.tracking_number,200);
    if(p.shipping_provider) evidence.shipping_carrier=cap(p.shipping_provider,200);
    if(p.shipped_at) evidence.shipping_date=day(p.shipped_at);
    if(address) evidence.shipping_address=cap(address,1000);
  }
  return evidence;
}
