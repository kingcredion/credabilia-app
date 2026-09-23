import { mediaInput } from './media.js';
import { editableFields } from './listingEdits.js';
import { credibilityScore } from './credibility.js';
import { DEMO_USER, listingInput, auditInput, sampleListings } from './domain.js';

export const DEMO_ACCOUNTS = [DEMO_USER, { ...DEMO_USER, id: '22222222-2222-4222-8222-222222222222', display_name: 'Jordan Lee' }];

export function createDemoService(storage = window.localStorage) {
  const key = 'credabilia-next-demo-v2';
  let listeners = new Set();
  const fresh = () => ({ userId: null, listings: sampleListings(), audits: [], uploads: {}, xp: {}, names: {}, favorites: {}, purchases: [], revisions: [], slugs: {}, shippingAddresses: {}, messages: [], credits: [], supportMessages: [], refundRequests: [], buyRequests: [], sellerRatings: [], bids: [], reports: [], blocks: [] });
  let state;
  try { const saved = JSON.parse(storage.getItem(key)); state = saved && Array.isArray(saved.listings) && Array.isArray(saved.audits) ? saved : fresh(); } catch { state = fresh(); }
  state.uploads ||= {}; state.names ||= {}; state.favorites ||= {}; state.purchases ||= []; state.revisions ||= []; state.slugs ||= {}; state.shippingAddresses ||= {}; state.messages ||= []; state.credits ||= []; state.supportMessages ||= []; state.refundRequests ||= []; state.buyRequests ||= []; state.sellerRatings ||= []; state.bids ||= []; state.reports ||= []; state.blocks ||= [];
  function sellerRatingStats(sellerId) {
    const ratings=state.sellerRatings.filter(r=>r.seller_id===sellerId);
    if(!ratings.length) return {avg:null,count:0};
    return {avg:Math.round(ratings.reduce((sum,r)=>sum+r.rating,0)/ratings.length*100)/100,count:ratings.length};
  }
  const REQUIRED_ADDRESS_FIELDS = ['name', 'street1', 'city', 'state', 'zip', 'country'];
  function validAddress(address) { return REQUIRED_ADDRESS_FIELDS.every(key => String(address?.[key] || '').trim()); }
  function save() { storage.setItem(key, JSON.stringify(state)); }
  const currentUser = () => DEMO_ACCOUNTS.find(user => user.id === state.userId);
  const session = () => currentUser() ? { user: { id: state.userId } } : null;
  function requireUser() { if (!currentUser()) throw new Error('Sign in to continue.'); }
  return {
    mode: 'demo', detailsEnabled: true,
    async uploadImage(blob,kind) {
      requireUser();
      const url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
      const path=state.userId+'/'+crypto.randomUUID()+'.jpg';
      state.uploads[path]={path,kind,url};
      try {save();} catch {delete state.uploads[path];throw new Error('Practice photo storage is full. Remove a photo or reset the demo.');}
      return {...state.uploads[path]};
    },
    async removeImage(path) {
      requireUser();
      if(!path.startsWith(state.userId+'/') || state.listings.some(item=>(item.media || []).some(asset=>asset.path===path))) throw new Error('This photo cannot be removed.');
      delete state.uploads[path];save();
    },
    async signMediaUrls(media) {
      return media.map(asset=>({...asset,url:state.uploads[asset.path]?.url||null}));
    },
    async removeBackground() {throw new Error('Background removal requires the connected app and an AI service. Not available in this practice preview.');},
    async analyzeSignature() {throw new Error('AI signature review requires the connected app and an AI service. Not available in this practice preview.');},
    async pushSubscriptionStatus() {return {supported:false,subscribed:false};},
    async enableNotifications() {throw new Error('Push notifications require the connected app. Not available in this practice preview.');},
    async disableNotifications() {},
    async extractCertificate() {throw new Error('AI reading requires the connected app and an AI service. Enter certificate details manually in this practice preview.');},
    async draftListing() {throw new Error('AI drafts require the connected app and an AI service. Fill in the details manually in this practice preview.');},
    async getTrivia() {return null;},
    async generateTrivia() {throw new Error('AI trivia requires the connected app and an AI service. Not available in this practice preview.');},
    async submitTriviaResponse() {throw new Error('AI trivia requires the connected app and an AI service. Not available in this practice preview.');},
    async getSession() { return session(); },
    onAuthChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async signIn(userId = DEMO_USER.id) { if (!DEMO_ACCOUNTS.some(user => user.id === userId)) throw new Error('Choose a practice account.'); state.userId = userId; save(); listeners.forEach(fn => fn(session())); },
    async signOut() { state.userId = null; save(); listeners.forEach(fn => fn(null)); },
    async profile() { requireUser(); return { ...currentUser(), display_name: state.names[state.userId] || currentUser().display_name, xp: state.xp[state.userId] || 0, learning_xp: 0, slug: state.slugs[state.userId] || null, shipping_address: state.shippingAddresses[state.userId] || null }; },
    async saveShippingAddress(address) {
      requireUser();
      if (!validAddress(address)) throw new Error('Fill in all required address fields.');
      state.shippingAddresses[state.userId] = address; save();
    },
    async validateAddress(address) {
      requireUser();
      if (!validAddress(address)) throw new Error('Fill in street, city, state, ZIP, and country first.');
      const titleCase=s=>String(s||'').trim().replace(/\w\S*/g,w=>w[0].toUpperCase()+w.slice(1).toLowerCase());
      const suggested={name:address.name||'',street1:titleCase(address.street1),street2:titleCase(address.street2||''),city:titleCase(address.city),state:String(address.state).trim().toUpperCase().slice(0,2),zip:String(address.zip).trim(),country:String(address.country).trim().toUpperCase(),phone:address.phone||''};
      return {is_valid:true,messages:['This is a simulated check in the local preview, not a real USPS lookup.'],suggested};
    },
    async updateProfile(displayName) {
      requireUser();
      const trimmed=String(displayName || '').trim();
      if(!trimmed || trimmed.length>100) throw new Error('Use a display name between 1 and 100 characters.');
      state.names[state.userId]=trimmed; save();
    },
    async toggleFavorite(listingId) {
      requireUser();
      const mine=state.favorites[state.userId] ||= [];
      const index=mine.indexOf(listingId);
      if(index>=0) { mine.splice(index,1); save(); return false; }
      mine.push(listingId); save(); return true;
    },
    async myFavoriteIds() { requireUser(); return state.favorites[state.userId] || []; },
    async requestToBuy(listingId) {
      requireUser();
      const item=state.listings.find(x=>x.id===listingId);
      if(!item || item.status!=='active') throw new Error('This item is not available to buy.');
      if(item.seller_id===state.userId) throw new Error('You cannot buy your own listing.');
      const request={id:crypto.randomUUID(),listing_id:listingId,buyer_id:state.userId,seller_id:item.seller_id,status:'pending',
        created_at:new Date().toISOString(),expires_at:new Date(Date.now()+24*60*60*1000).toISOString()};
      state.buyRequests.push(request); item.status='pending';
      try{save();}catch(error){state.buyRequests.pop();item.status='active';throw error;}
      return {id:request.id,listing_id:listingId,status:'pending',expires_at:request.expires_at};
    },
    async respondToBuyRequest(requestId,available) {
      requireUser();
      const request=state.buyRequests.find(r=>r.id===requestId && r.seller_id===state.userId);
      if(!request) throw new Error('Request not found.');
      if(request.status!=='pending') throw new Error('This request has already been answered.');
      request.status=available?'confirmed':'declined'; request.responded_at=new Date().toISOString();
      if(!available) { const item=state.listings.find(x=>x.id===request.listing_id); if(item && item.status==='pending') item.status='active'; }
      save();
      return {id:requestId,status:request.status};
    },
    async myOpenBuyRequests() {
      requireUser();
      return state.buyRequests.filter(r=>r.buyer_id===state.userId && (r.status==='pending' || r.status==='confirmed')).map(r=>{
        const item=state.listings.find(x=>x.id===r.listing_id) || {};
        return {id:r.id,listing_id:r.listing_id,title:item.title,category:item.category,price_cents:item.price_cents,status:r.status,expires_at:r.expires_at,
          media:(item.media||[]).filter(asset=>asset.kind==='item')};
      });
    },
    async myBuyRequests() {
      requireUser();
      return state.buyRequests.filter(r=>r.seller_id===state.userId && r.status==='pending').map(r=>{
        const item=state.listings.find(x=>x.id===r.listing_id) || {};
        return {id:r.id,listing_id:r.listing_id,title:item.title,price_cents:item.price_cents,created_at:r.created_at,expires_at:r.expires_at,
          buyer_name:state.names[r.buyer_id] || DEMO_ACCOUNTS.find(u=>u.id===r.buyer_id)?.display_name || 'A collector',
          media:(item.media||[]).filter(asset=>asset.kind==='item')};
      });
    },
    async startCheckout(listingId, shippingAddress, applyCreditCents, wantInsurance) {
      requireUser();
      const item=state.listings.find(x=>x.id===listingId);
      const confirmedRequest=state.buyRequests.find(r=>r.listing_id===listingId && r.buyer_id===state.userId && r.status==='confirmed');
      if(!confirmedRequest) throw new Error('Ask the seller to confirm this item is still available before buying.');
      if(!item || item.status!=='pending') throw new Error('This item is not available to buy.');
      if(item.seller_id===state.userId) throw new Error('You cannot buy your own listing.');
      if(!validAddress(shippingAddress)) throw new Error('Fill in all required address fields.');
      // platform_fee_cents/seller_payout_cents mirror the real eBay-style fee (13.6% + $0.30/$0.40),
      // so demo revenue stats match production semantics.
      const platformFeeCents=Math.round(item.price_cents*0.136)+(item.price_cents<=1000?30:40);
      let creditToApply=0;
      if(applyCreditCents>0) {
        const balance=state.credits.filter(c=>c.user_id===state.userId).reduce((sum,c)=>sum+c.amount_cents,0);
        if(applyCreditCents>balance) throw new Error('You do not have that much credit available.');
        // Credion Coins apply toward the item's price, up to 50% of it -- matches
        // reserve_listing_checkout()'s live cap, not the platform fee.
        creditToApply=Math.min(applyCreditCents,Math.round(item.price_cents*0.5));
      }
      // Fakes a marked-up quote using the listing's own stored dimensions, matching the live
      // "real Shippo quote at checkout" flow without a real carrier call in this local preview.
      const hasParcel=item.weight_oz && item.length_in && item.width_in && item.height_in;
      const shippingCostCents=hasParcel ? 895 : 0;
      const sellerShippingCharge=item.free_shipping ? shippingCostCents : 0;
      const insured=hasParcel && wantInsurance!==false;
      const insuranceCostCents=insured ? 50 : 0;
      const purchase={id:crypto.randomUUID(),listing_id:listingId,buyer_id:state.userId,seller_id:item.seller_id,price_cents:item.price_cents,
        platform_fee_cents:platformFeeCents,seller_shipping_charge_cents:sellerShippingCharge,
        seller_payout_cents:item.price_cents-platformFeeCents-sellerShippingCharge,
        shipping_cost_cents:shippingCostCents,applied_credit_cents:creditToApply,
        insured,insured_value_cents:insured?item.price_cents:0,insurance_cost_cents:insuranceCostCents,
        escrow_status:'held',funds_released_at:null,
        created_at:new Date().toISOString(),shipping_address:shippingAddress,tracking_status:'UNKNOWN'};
      state.purchases.push(purchase);
      if(creditToApply>0) state.credits.push({id:crypto.randomUUID(),user_id:state.userId,amount_cents:-creditToApply,reason:'Applied to checkout',created_at:new Date().toISOString()});
      item.status='sold';
      try{save();}catch(error){state.purchases.pop();item.status='active';if(creditToApply>0)state.credits.pop();throw error;}
      return {completed:true};
    },
    async myCreditBalance() { requireUser(); return state.credits.filter(c=>c.user_id===state.userId).reduce((sum,c)=>sum+c.amount_cents,0); },
    async myPurchases() {
      requireUser();
      return state.purchases.filter(p=>p.buyer_id===state.userId).map(p=>{
        const item=state.listings.find(x=>x.id===p.listing_id) || {};
        const refund=state.refundRequests.find(r=>r.purchase_id===p.id);
        const rating=state.sellerRatings.find(r=>r.purchase_id===p.id);
        return {id:item.id,purchase_id:p.id,title:item.title,description:item.description,category:item.category,evidence:item.evidence,price_cents:item.price_cents,attributes:item.attributes,tags:item.tags,certificate_issuer:item.certificate_issuer,certificate_number:item.certificate_number,certificate_company:item.certificate_company,media:item.media || [],purchased_at:p.created_at,shipping_cost_cents:p.shipping_cost_cents || 0,tracking_number:p.tracking_number || null,tracking_url:p.tracking_url || null,tracking_status:p.tracking_status || 'UNKNOWN',shipped_at:p.shipped_at || null,escrow_status:p.escrow_status || 'held',insured:!!p.insured,insurance_cost_cents:p.insurance_cost_cents || 0,refund_status:refund?.status || null,refund_reason:refund?.reason || null,refund_seller_response:refund?.seller_response || null,refund_request_id:refund?.id || null,offered_amount_cents:refund?.offered_amount_cents ?? null,return_tracking_number:refund?.return_tracking_number || null,return_tracking_url:refund?.return_tracking_url || null,return_label_url:refund?.return_label_url || null,return_shipped_at:refund?.return_shipped_at || null,return_tracking_status:refund?.return_tracking_status || 'UNKNOWN',message_count:state.messages.filter(m=>m.purchase_id===p.id).length,my_rating:rating?.rating ?? null,my_rating_comment:rating?.comment ?? null};
      });
    },
    async rateSeller(purchaseId, rating, comment) {
      requireUser();
      const purchase=state.purchases.find(p=>p.id===purchaseId && p.buyer_id===state.userId);
      if(!purchase) throw new Error('Purchase not found.');
      const value=Number(rating);
      if(!Number.isInteger(value) || value<1 || value>5) throw new Error('Choose a rating between 1 and 5 stars.');
      const cleanComment=String(comment || '').trim() || null;
      if(cleanComment && cleanComment.length>500) throw new Error('Keep your comment under 500 characters.');
      let existing=state.sellerRatings.find(r=>r.purchase_id===purchaseId);
      if(existing) { existing.rating=value; existing.comment=cleanComment; existing.updated_at=new Date().toISOString(); }
      else { existing={id:crypto.randomUUID(),purchase_id:purchaseId,seller_id:purchase.seller_id,buyer_id:state.userId,rating:value,comment:cleanComment,created_at:new Date().toISOString()}; state.sellerRatings.push(existing); }
      save();
      return {...existing};
    },
    async mySales() {
      requireUser();
      return state.purchases.filter(p=>p.seller_id===state.userId).map(p=>{
        const item=state.listings.find(x=>x.id===p.listing_id) || {};
        const refund=state.refundRequests.find(r=>r.purchase_id===p.id);
        return {id:p.id,listing_id:item.id,title:item.title,category:item.category,price_cents:p.price_cents,created_at:p.created_at,shipping_address:p.shipping_address,
          shipping_cost_cents:p.shipping_cost_cents || 0,seller_shipping_charge_cents:p.seller_shipping_charge_cents || 0,
          tracking_number:p.tracking_number || null,tracking_url:p.tracking_url || null,tracking_status:p.tracking_status || 'UNKNOWN',label_url:p.label_url || null,shipped_at:p.shipped_at || null,
          escrow_status:p.escrow_status || 'held',funds_released_at:p.funds_released_at || null,
          refund_status:refund?.status || null,refund_reason:refund?.reason || null,refund_seller_response:refund?.seller_response || null,refund_request_id:refund?.id || null,
          offered_amount_cents:refund?.offered_amount_cents ?? null,return_tracking_number:refund?.return_tracking_number || null,return_tracking_url:refund?.return_tracking_url || null,return_label_url:refund?.return_label_url || null,return_shipped_at:refund?.return_shipped_at || null,return_tracking_status:refund?.return_tracking_status || 'UNKNOWN',
          message_count:state.messages.filter(m=>m.purchase_id===p.id).length,
          media:(item.media||[]).filter(asset=>asset.kind==='item')};
      });
    },
    async getShippingRates(purchaseId, parcel) {
      requireUser();
      const purchase=state.purchases.find(p=>p.id===purchaseId && p.seller_id===state.userId);
      if(!purchase) throw new Error('Sale not found.');
      const item=state.listings.find(x=>x.id===purchase.listing_id);
      const source=(item?.weight_oz && item?.length_in && item?.width_in && item?.height_in) ? item : parcel;
      const weight=Number(source?.weight_oz), length=Number(source?.length_in), width=Number(source?.width_in), height=Number(source?.height_in);
      if(![weight,length,width,height].every(n=>Number.isFinite(n) && n>0)) throw new Error('Enter a valid package weight and size.');
      return [
        {rate_id:'demo-usps-'+purchaseId,provider:'USPS',servicelevel:'Priority Mail',amount_cents:895,estimated_days:2},
        {rate_id:'demo-ups-'+purchaseId,provider:'UPS',servicelevel:'Ground',amount_cents:1240,estimated_days:4},
      ];
    },
    async buyShippingLabel(purchaseId, rateId) {
      requireUser();
      const purchase=state.purchases.find(p=>p.id===purchaseId && p.seller_id===state.userId);
      if(!purchase) throw new Error('Sale not found.');
      // Demo mode has no real async tracking to simulate delivery over days, so shipping a label
      // here also immediately simulates delivery and releases escrow -- good enough to preview
      // the UI/stats without modeling a multi-day wait.
      const shipped={shippo_transaction_id:'demo-'+rateId,tracking_number:'DEMO'+Math.floor(Math.random()*1e9),tracking_url:'https://example.com/track/demo',label_url:'https://example.com/label/demo.pdf',shipped_at:new Date().toISOString(),escrow_status:'released',funds_released_at:new Date().toISOString()};
      Object.assign(purchase,shipped); save();
      return shipped;
    },
    async getMessages(purchaseId) {
      requireUser();
      const purchase=state.purchases.find(p=>p.id===purchaseId && (p.buyer_id===state.userId || p.seller_id===state.userId));
      if(!purchase) throw new Error('Purchase not found.');
      return state.messages.filter(m=>m.purchase_id===purchaseId).map(m=>({...m,sender_name:state.names[m.sender_id] || DEMO_ACCOUNTS.find(user=>user.id===m.sender_id)?.display_name || 'Collector'}));
    },
    async sendMessage(purchaseId, body) {
      requireUser();
      const purchase=state.purchases.find(p=>p.id===purchaseId && (p.buyer_id===state.userId || p.seller_id===state.userId));
      if(!purchase) throw new Error('Purchase not found.');
      const other=purchase.buyer_id===state.userId ? purchase.seller_id : purchase.buyer_id;
      if((state.blocks || []).some(b=>(b.blocker_id===state.userId && b.blocked_id===other) || (b.blocker_id===other && b.blocked_id===state.userId))) throw new Error('You cannot message this user.');
      const clean=String(body || '').trim();
      if(!clean || clean.length>2000) throw new Error('Write a message between 1 and 2000 characters.');
      const message={id:crypto.randomUUID(),purchase_id:purchaseId,sender_id:state.userId,body:clean,created_at:new Date().toISOString()};
      state.messages.push(message); save();
      return {...message,sender_name:state.names[state.userId] || currentUser().display_name};
    },
    async markMessagesRead(purchaseId) {
      requireUser();
      const purchase=state.purchases.find(p=>p.id===purchaseId && (p.buyer_id===state.userId || p.seller_id===state.userId));
      if(!purchase) throw new Error('Purchase not found.');
      const now=new Date().toISOString();
      if(purchase.buyer_id===state.userId) purchase.buyer_last_read_at=now;
      if(purchase.seller_id===state.userId) purchase.seller_last_read_at=now;
      save();
    },
    async myNotifications() {
      requireUser();
      const notifications=[];
      for(const p of state.purchases) {
        const item=state.listings.find(x=>x.id===p.listing_id);
        if(!item) continue;
        const refund=state.refundRequests.find(r=>r.purchase_id===p.id);
        if(refund?.seller_id===state.userId && refund.status==='pending') notifications.push({kind:'refund_pending',role:'seller',purchase_id:p.id,listing_id:item.id,title:item.title,message:`Refund requested for "${item.title}"`});
        if(refund?.buyer_id===state.userId && refund.status==='partial_offered') notifications.push({kind:'partial_offered',role:'buyer',purchase_id:p.id,listing_id:item.id,title:item.title,message:`Partial refund offered for "${item.title}"`});
        if(refund?.buyer_id===state.userId && refund.status==='return_required' && !refund.return_shipped_at) notifications.push({kind:'return_required',role:'buyer',purchase_id:p.id,listing_id:item.id,title:item.title,message:`Ship "${item.title}" back to get your refund`});

        const messages=state.messages.filter(m=>m.purchase_id===p.id);
        if(p.seller_id===state.userId) {
          const lastFromBuyer=messages.filter(m=>m.sender_id===p.buyer_id).reduce((max,m)=>m.created_at>max?m.created_at:max,'');
          if(lastFromBuyer && (!p.seller_last_read_at || lastFromBuyer>p.seller_last_read_at)) notifications.push({kind:'message',role:'seller',purchase_id:p.id,listing_id:item.id,title:item.title,message:`New message about "${item.title}"`});
        }
        if(p.buyer_id===state.userId) {
          const lastFromSeller=messages.filter(m=>m.sender_id===p.seller_id).reduce((max,m)=>m.created_at>max?m.created_at:max,'');
          if(lastFromSeller && (!p.buyer_last_read_at || lastFromSeller>p.buyer_last_read_at)) notifications.push({kind:'message',role:'buyer',purchase_id:p.id,listing_id:item.id,title:item.title,message:`New message about "${item.title}"`});
        }
      }
      for(const r of state.buyRequests) {
        const item=state.listings.find(x=>x.id===r.listing_id);
        if(!item) continue;
        if(r.seller_id===state.userId && r.status==='pending') notifications.push({kind:'buy_request_pending',role:'seller',purchase_id:null,listing_id:item.id,title:item.title,message:`Confirm "${item.title}" is still available`});
        if(r.buyer_id===state.userId && r.status==='confirmed') notifications.push({kind:'buy_request_confirmed',role:'buyer',purchase_id:null,listing_id:item.id,title:item.title,message:`"${item.title}" is confirmed available — complete your purchase`});
      }
      return notifications;
    },
    async getSupportMessages() { requireUser(); return state.supportMessages.filter(m=>m.user_id===state.userId); },
    async sendSupportMessage() { requireUser(); throw new Error('AI chat requires the connected app and an AI service. Not available in this practice preview.'); },
    async requestRefund(purchaseId, reason) {
      requireUser();
      const purchase=state.purchases.find(p=>p.id===purchaseId && p.buyer_id===state.userId);
      if(!purchase) throw new Error('Purchase not found.');
      if(purchase.escrow_status==='refunded') throw new Error('This order has already been refunded.');
      const clean=String(reason || '').trim();
      if(!clean || clean.length>2000) throw new Error('Explain the issue in 1 to 2000 characters.');
      if(state.refundRequests.some(r=>r.purchase_id===purchaseId && ['pending','contested','accepted'].includes(r.status))) throw new Error('A refund request is already open for this order.');
      const request={id:crypto.randomUUID(),purchase_id:purchaseId,buyer_id:state.userId,seller_id:purchase.seller_id,reason:clean,status:'pending',seller_response:null,created_at:new Date().toISOString()};
      state.refundRequests.push(request); save();
      return request;
    },
    async contestRefundRequest(requestId, response) {
      requireUser();
      const request=state.refundRequests.find(r=>r.id===requestId && r.seller_id===state.userId);
      if(!request) throw new Error('Refund request not found.');
      if(request.status!=='pending') throw new Error('This request has already been responded to.');
      const clean=String(response || '').trim().slice(0,2000) || null;
      request.status='contested'; request.seller_response=clean; save();
      return request;
    },
    async acceptRefundRequest(requestId) {
      requireUser();
      const request=state.refundRequests.find(r=>r.id===requestId && r.seller_id===state.userId);
      if(!request) throw new Error('Refund request not found.');
      if(request.status!=='pending') throw new Error('This request has already been responded to.');
      // No real Stripe call to simulate here -- immediately resolve, matching how the rest of
      // demo mode fully simulates money movement without a real payment provider.
      request.status='refunded'; request.resolved_at=new Date().toISOString();
      const purchase=state.purchases.find(p=>p.id===request.purchase_id);
      if(purchase) purchase.escrow_status='refunded';
      save();
      return { refunded:true };
    },
    async offerPartialRefund(requestId, amountCents, response) {
      requireUser();
      const request=state.refundRequests.find(r=>r.id===requestId && r.seller_id===state.userId);
      if(!request) throw new Error('Refund request not found.');
      if(request.status!=='pending') throw new Error('This request has already been responded to.');
      const purchase=state.purchases.find(p=>p.id===request.purchase_id);
      if(!(amountCents>0) || amountCents>=purchase.price_cents) throw new Error('Enter a partial amount less than the item price.');
      const clean=String(response || '').trim().slice(0,2000) || null;
      request.status='partial_offered'; request.offered_amount_cents=amountCents; request.seller_response=clean; save();
      return request;
    },
    async requireReturn(requestId, response) {
      requireUser();
      const request=state.refundRequests.find(r=>r.id===requestId && r.seller_id===state.userId);
      if(!request) throw new Error('Refund request not found.');
      if(request.status!=='pending') throw new Error('This request has already been responded to.');
      const clean=String(response || '').trim().slice(0,2000) || null;
      request.status='return_required'; request.seller_response=clean; save();
      return request;
    },
    async respondToPartialOffer(requestId, accept) {
      requireUser();
      const request=state.refundRequests.find(r=>r.id===requestId && r.buyer_id===state.userId);
      if(!request) throw new Error('Refund request not found.');
      if(request.status!=='partial_offered') throw new Error('There is no partial offer awaiting your response.');
      if(!accept) { request.status='contested'; save(); return request; }
      // No real Stripe call to simulate here -- immediately resolve, matching acceptRefundRequest.
      request.status='refunded'; request.resolved_at=new Date().toISOString();
      const purchase=state.purchases.find(p=>p.id===request.purchase_id);
      if(purchase) purchase.escrow_status='partially_refunded';
      save();
      return { refunded:true };
    },
    async getReturnLabelRates(refundRequestId) {
      requireUser();
      const request=state.refundRequests.find(r=>r.id===refundRequestId && r.buyer_id===state.userId);
      if(!request) throw new Error('Refund request not found.');
      if(request.status!=='return_required') throw new Error('A return label is not needed for this request.');
      return [
        {rate_id:'demo-return-usps-'+refundRequestId,provider:'USPS',servicelevel:'Priority Mail',amount_cents:895,estimated_days:2},
        {rate_id:'demo-return-ups-'+refundRequestId,provider:'UPS',servicelevel:'Ground',amount_cents:1240,estimated_days:4},
      ];
    },
    async buyReturnLabel(refundRequestId, rateId) {
      requireUser();
      const request=state.refundRequests.find(r=>r.id===refundRequestId && r.buyer_id===state.userId);
      if(!request) throw new Error('Refund request not found.');
      if(request.status!=='return_required') throw new Error('A return label is not needed for this request.');
      // Demo mode has no real async tracking to simulate the days-long trip back to the seller,
      // so buying the label here also immediately simulates delivery and the resulting refund --
      // same simplification buyShippingLabel already makes for the outbound leg.
      const shippedAt=new Date().toISOString();
      request.return_tracking_number='DEMO'+Math.floor(Math.random()*1e9);
      request.return_tracking_url='https://example.com/track/demo';
      request.return_label_url='https://example.com/label/demo.pdf';
      request.return_shipped_at=shippedAt;
      request.return_tracking_status='DELIVERED';
      request.status='refunded'; request.resolved_at=shippedAt;
      const purchase=state.purchases.find(p=>p.id===request.purchase_id);
      if(purchase) purchase.escrow_status='refunded';
      save();
      return {label_url:request.return_label_url,tracking_number:request.return_tracking_number,tracking_url:request.return_tracking_url,shipped_at:shippedAt};
    },
    async operatorOpenDisputeCount() { requireUser(); return null; },
    async isOperator() { requireUser(); return false; },
    async adminListRefundRequests() { requireUser(); return []; },
    async adminResolveRefundRequest() { throw new Error('The admin dashboard requires the connected app. Not available in this practice preview.'); },
    async adminListReports() { requireUser(); return []; },
    async adminResolveReport() { throw new Error('The admin dashboard requires the connected app. Not available in this practice preview.'); },
    async adminListSupportConversations() { requireUser(); return []; },
    async adminGetSupportThread() { requireUser(); return []; },
    async adminReplyToSupport() { throw new Error('The admin dashboard requires the connected app. Not available in this practice preview.'); },
    async adminListUsers() { requireUser(); return []; },
    async reportContent(targetType, targetId, reason, details) {
      requireUser();
      const clean=String(reason || '').trim();
      if(!clean) throw new Error('Choose a reason.');
      (state.reports ||= []).push({id:crypto.randomUUID(),reporter_id:state.userId,target_type:targetType,target_id:targetId,reason:clean,details:details||null,status:'open',created_at:new Date().toISOString()});
      save();
      return {id:state.reports[state.reports.length-1].id};
    },
    async blockUser(userId) {
      requireUser();
      if(userId===state.userId) throw new Error('You cannot block yourself.');
      (state.blocks ||= []).push({blocker_id:state.userId,blocked_id:userId,created_at:new Date().toISOString()});
      save();
    },
    async unblockUser(userId) {
      requireUser();
      state.blocks=(state.blocks || []).filter(b=>!(b.blocker_id===state.userId && b.blocked_id===userId));
      save();
    },
    async myBlockedUsers() {
      requireUser();
      return (state.blocks || []).filter(b=>b.blocker_id===state.userId).map(b=>({user_id:b.blocked_id,display_name:state.names[b.blocked_id] || DEMO_ACCOUNTS.find(u=>u.id===b.blocked_id)?.display_name || 'Collector'}));
    },
    async deleteMyAccount() {
      requireUser();
      if(state.listings.some(item=>item.seller_id===state.userId && item.status==='active')) throw new Error('Please remove or sell your active listings before deleting your account.');
      if(state.refundRequests.some(r=>(r.buyer_id===state.userId || r.seller_id===state.userId) && !['refunded','denied'].includes(r.status))) throw new Error('Please resolve your open refund requests before deleting your account.');
      const deletedId=state.userId;
      state.names[deletedId]='Deleted user'; delete state.shippingAddresses[deletedId];
      state.userId=null; save(); listeners.forEach(fn=>fn(null));
    },
    async markListingRelisted(listingId,purchaseId) {
      requireUser();
      const item=state.listings.find(x=>x.id===listingId);
      const purchase=state.purchases.find(p=>p.id===purchaseId && p.buyer_id===state.userId);
      if(!item || item.seller_id!==state.userId || !purchase) return;
      item.relisted_from_purchase_id=purchaseId; save();
    },
    async updateStoreSlug(slug) {
      requireUser();
      const clean=String(slug || '').trim().toLowerCase();
      if(!/^[a-z0-9][a-z0-9-]{2,29}$/.test(clean)) throw new Error('Use 3-30 characters: lowercase letters, numbers, and hyphens only.');
      if(['auth','api','admin','app','www','static','assets'].includes(clean)) throw new Error('That store name is reserved. Choose another.');
      if(Object.entries(state.slugs).some(([userId,value])=>value===clean && userId!==state.userId)) throw new Error('That store name is already taken.');
      state.slugs[state.userId]=clean; save();
    },
    async getStorefront(slug) {
      const clean=String(slug || '').trim().toLowerCase();
      const userId=Object.entries(state.slugs).find(([,value])=>value===clean)?.[0];
      if(!userId) return null;
      const account=DEMO_ACCOUNTS.find(user=>user.id===userId);
      const sellerListings=state.listings.filter(item=>item.seller_id===userId && item.status==='active');
      const {avg,count}=sellerRatingStats(userId);
      return {
        display_name:state.names[userId] || account?.display_name || 'Collector',
        slug:clean,
        member_since:new Date().toISOString(),
        sales_count:state.purchases.filter(p=>p.seller_id===userId).length,
        rating_avg:avg,rating_count:count,
        reviews:state.sellerRatings.filter(r=>r.seller_id===userId).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,20)
          .map(r=>({rating:r.rating,comment:r.comment,created_at:r.created_at,buyer_name:state.names[r.buyer_id] || DEMO_ACCOUNTS.find(u=>u.id===r.buyer_id)?.display_name || 'A collector'})),
        listings:sellerListings.map(item=>({id:item.id,title:item.title,category:item.category,price_cents:item.price_cents,
          media:(item.media||[]).filter(asset=>asset.kind==='item')})),
      };
    },
    async myDashboardStats() {
      requireUser();
      const mySales=state.purchases.filter(p=>p.seller_id===state.userId);
      return {
        items_sold:mySales.length,
        revenue_cents:mySales.reduce((sum,p)=>sum+(p.seller_payout_cents ?? p.price_cents),0),
        items_bought:state.purchases.filter(p=>p.buyer_id===state.userId).length,
        items_relisted:state.listings.filter(item=>item.seller_id===state.userId && item.relisted_from_purchase_id).length,
        audits_given:state.audits.filter(a=>a.auditor_id===state.userId).length,
        audits_received:state.audits.filter(a=>state.listings.find(item=>item.id===a.listing_id)?.seller_id===state.userId).length,
      };
    },
    async listings() { return state.listings.filter(item => item.status === 'active').map(item => { const current=state.audits.filter(a => a.listing_id === item.id && (a.listing_version||1) === (item.version||1)); const {avg,count}=sellerRatingStats(item.seller_id); return { ...item, ...credibilityScore(item,current), audit_count: current.length, seller_member_since:new Date().toISOString(), seller_sales_count:state.purchases.filter(p=>p.seller_id===item.seller_id).length, seller_rating_avg:avg, seller_rating_count:count }; }); },
    async myAudits() { requireUser(); return state.audits.filter(a => a.auditor_id === state.userId); },
    async getListingHistory(listingId) {
      return state.revisions.filter(r=>r.listing_id===listingId).map(r=>({...r,
        audits:state.audits.filter(a=>a.listing_id===listingId && (a.listing_version||1)===r.version).map(a=>({verdict:a.verdict,explanation:a.explanation,created_at:a.created_at}))
      })).sort((a,b)=>b.version-a.version);
    },
    async createListing(input) {
      requireUser();
      const value = listingInput(input);
      const media=mediaInput(input.media).map(asset=>{if(!asset.path.startsWith(state.userId+'/') || !state.uploads[asset.path]) throw new Error('Photo upload is missing.');return {...asset,url:state.uploads[asset.path].url};});
      const isAuction=input.listing_type==='auction';
      if(isAuction && ![3,5,7].includes(Number(input.auction_days))) throw new Error('Choose a 3, 5, or 7 day auction.');
      const item = { ...value, media, id: crypto.randomUUID(), seller_id: state.userId, seller_name: currentUser().display_name, status: 'active', created_at: new Date().toISOString(), artwork: 'generic', audit_count: 0,
        listing_type: isAuction ? 'auction' : 'fixed', bid_count: 0, auction_ends_at: isAuction ? new Date(Date.now()+Number(input.auction_days)*24*60*60*1000).toISOString() : null,
        signature_ai_label: input.signature_ai_label || null, signature_ai_note: input.signature_ai_note || null };
      state.listings.unshift(item); try {save();} catch(error) {state.listings.shift();throw error;} return item.id;
    },
    async placeBid(listingId, amountCents) {
      requireUser();
      const item=state.listings.find(x=>x.id===listingId);
      if(!item || item.status!=='active' || item.listing_type!=='auction') throw new Error('This auction is not available for bidding.');
      if(new Date(item.auction_ends_at)<=new Date()) throw new Error('This auction has ended.');
      if(item.seller_id===state.userId) throw new Error('You cannot bid on your own listing.');
      const minimum=item.bid_count===0 ? item.price_cents : item.price_cents+100;
      if(amountCents<minimum) throw new Error('Enter a higher bid.');
      item.price_cents=amountCents; item.bid_count+=1;
      (state.bids ||= []).push({id:crypto.randomUUID(),listing_id:listingId,bidder_id:state.userId,amount_cents:amountCents,created_at:new Date().toISOString()});
      save();
      return {id:item.id,amount_cents:amountCents,bid_count:item.bid_count};
    },
    async editListing(original,input,mediaTouched) {
      requireUser();
      const item=state.listings.find(x=>x.id===original.id);
      if(!item || item.seller_id!==state.userId || !currentUser().can_sell) throw new Error('You can only edit your own listing.');
      if(item.status!=='active') throw new Error('Only active listings can be edited.');
      if(JSON.stringify(editableFields(item))!==JSON.stringify(editableFields(original))) throw new Error('This listing changed. Reopen it before editing.');
      const value=editableFields(listingInput(input));
      if(value.category!==item.category && Object.keys(item.attributes || {}).length) throw new Error('Category changes for items with structured details are not available yet.');
      const version=item.version||1;
      const certificate={certificate_issuer:input.certificate_issuer||null,certificate_number:input.certificate_number||null,certificate_company:input.certificate_company||null};
      const media=mediaTouched?mediaInput(input.media).map(asset=>{
        const known=state.uploads[asset.path] || (item.media||[]).find(m=>m.path===asset.path);
        if(!asset.path.startsWith(state.userId+'/') || !known) throw new Error('Photo upload is missing.');
        return {...asset,url:known.url};
      }):item.media;
      const substantive=['title','description','category','evidence'].some(k=>value[k]!==item[k])
        || certificate.certificate_issuer!==(item.certificate_issuer||null) || certificate.certificate_number!==(item.certificate_number||null) || certificate.certificate_company!==(item.certificate_company||null)
        || mediaTouched;
      const hasCurrentAudits=state.audits.some(a=>a.listing_id===item.id && (a.listing_version||1)===version);
      const before={...item};
      if(substantive && hasCurrentAudits) {
        state.revisions.push({listing_id:item.id,version,title:item.title,description:item.description,category:item.category,evidence:item.evidence,
          certificate_issuer:item.certificate_issuer||null,certificate_number:item.certificate_number||null,certificate_company:item.certificate_company||null,
          attributes:item.attributes||{},tags:item.tags||[],media:item.media||[],archived_at:new Date().toISOString()});
        item.version=version+1;
      }
      Object.assign(item,value,certificate,{media,signature_ai_label:input.signature_ai_label||null,signature_ai_note:input.signature_ai_note||null});
      try{save();}catch(error){Object.assign(item,before);state.revisions.pop();throw error;}
    },
    async submitAudit(listingId, input) {
      requireUser(); const value = auditInput(input);
      const item = state.listings.find(x => x.id === listingId);
      if (!item || item.status !== 'active') throw new Error('This listing is not available for audit.');
      if (item.seller_id === state.userId) throw new Error('You cannot audit your own listing.');
      const version=item.version||1;
      if (state.audits.some(a => a.listing_id === listingId && a.auditor_id === state.userId && (a.listing_version||1)===version)) return { xp_earned: 0, already_submitted: true };
      state.audits.push({ ...value, id: crypto.randomUUID(), listing_id: listingId, auditor_id: state.userId, listing_version: version, created_at: new Date().toISOString() });
      state.xp[state.userId] = (state.xp[state.userId] || 0) + 5; save(); return { xp_earned: 5, already_submitted: false };
    },
    async reset() { state = fresh(); save(); listeners.forEach(fn => fn(null)); },
  };
}
