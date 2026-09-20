const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createHandler({createClient,env}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
    try {
      const authorization=request.headers.get('Authorization');
      if(!authorization?.startsWith('Bearer ')) return reply({error:'Sign in to buy a label.'},401);
      const client=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
      const {data:identity,error:authError}=await client.auth.getUser();
      if(authError || !identity?.user) return reply({error:'Sign in to buy a label.'},401);
      if(!env('SHIPPO_API_KEY')) return reply({error:'Shipping is not connected yet.'},503);

      const text=await request.text(); if(text.length>512) return reply({error:'Invalid request.'},400);
      let body;try{body=JSON.parse(text);}catch{return reply({error:'Invalid request.'},400);}
      const purchaseId=body?.purchase_id, rateId=body?.rate_id;
      if(typeof purchaseId!=='string' || !UUID_RE.test(purchaseId) || typeof rateId!=='string' || !rateId) return reply({error:'Invalid request.'},400);

      const {data:sale,error:saleError}=await client.from('purchases').select('id,shipped_at,label_url,tracking_number,tracking_url').eq('id',purchaseId).eq('seller_id',identity.user.id).maybeSingle();
      if(saleError || !sale) return reply({error:'Sale not found.'},404);
      // Idempotent: a retry after a lost response (network drop, timeout) must not buy a second label.
      if(sale.shipped_at) return reply({label_url:sale.label_url,tracking_number:sale.tracking_number,tracking_url:sale.tracking_url,shipped_at:sale.shipped_at});

      const transaction=await fetch('https://api.goshippo.com/transactions/',{
        method:'POST',
        headers:{Authorization:`ShippoToken ${env('SHIPPO_API_KEY')}`,'Content-Type':'application/json'},
        body:JSON.stringify({rate:rateId,label_file_type:'PDF',async:false}),
      }).then(r=>r.json());

      if(transaction.status!=='SUCCESS') return reply({error:transaction.messages?.[0]?.text || 'Could not buy this label. Try a different carrier option.'},400);

      const {error:recordError}=await client.rpc('record_shipment',{p_purchase_id:purchaseId,p_shippo_transaction_id:transaction.object_id,p_tracking_number:transaction.tracking_number,p_tracking_url:transaction.tracking_url_provider,p_label_url:transaction.label_url});
      if(recordError) return reply({error:`Label purchased, but could not be saved. Keep this tracking number: ${transaction.tracking_number}`},500);

      return reply({label_url:transaction.label_url,tracking_number:transaction.tracking_number,tracking_url:transaction.tracking_url_provider,shipped_at:new Date().toISOString()});
    } catch {return reply({error:'Shipping service is temporarily unavailable. Try again later.'},503);}
  };
}
