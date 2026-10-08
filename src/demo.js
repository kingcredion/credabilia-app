import { mediaInput } from './media.js';
import { editableFields } from './listingEdits.js';
import { credibilityScore } from './credibility.js';
import { auctionIncrement } from './auction.js';
import { DEMO_USER, listingInput, auditInput, sampleListings } from './domain.js';

export const DEMO_ACCOUNTS = [DEMO_USER, { ...DEMO_USER, id: '22222222-2222-4222-8222-222222222222', display_name: 'Jordan Lee' }];

// A small local sample, not the full ~500-row production table -- demo mode just needs enough to
// preview the station-picker UI, never a real backend query.
const DEMO_PICKUP_STATIONS = [
  { id: 'demo-station-1', jurisdiction: 'Fort Worth Police Department', city: 'Fort Worth', state: 'TX', country: 'USA', notes: null },
  { id: 'demo-station-2', jurisdiction: 'Cedar Park Police Department', city: 'Cedar Park', state: 'TX', country: 'USA', notes: "The Police Department's parking lot and lobby are monitored by 24-hour surveillance cameras and are located in well lit, public spaces." },
  { id: 'demo-station-3', jurisdiction: 'Boston Police Department', city: 'Boston', state: 'MA', country: 'USA', notes: 'Designated Safe Exchange Zones with 24 hr surveillance at all district stations and Police headquarters' },
  { id: 'demo-station-4', jurisdiction: 'Fremont Police Department', city: 'Fremont', state: 'CA', country: 'USA', notes: '2 marked spaces in the Police Dept. front lot under recorded video/audio surveillance 24/7' },
  { id: 'demo-station-5', jurisdiction: 'Calgary Police Service', city: 'Calgary', state: 'Alberta', country: 'Canada', notes: 'Parking lots at all district offices' },
];

export function createDemoService(storage = window.localStorage) {
  const key = 'credabilia-next-demo-v2';
  let listeners = new Set();
  const fresh = () => ({ userId: null, listings: sampleListings(), audits: [], uploads: {}, xp: {}, names: {}, favorites: {}, purchases: [], revisions: [], slugs: {}, shippingAddresses: {}, phones: {}, smsOptIns: {}, messages: [], conversations: [], credits: [], supportMessages: [], refundRequests: [], buyRequests: [], sellerRatings: [], bids: [], reports: [], blocks: [] });

  // Mirrors get_or_create_conversation(): one thread per (listing, buyer), findable either way.
  function getOrCreateConversation(listingId, buyerId, sellerId) {
    let conv = state.conversations.find(c => c.listing_id === listingId && c.buyer_id === buyerId);
    if (!conv) {
      conv = { id: crypto.randomUUID(), listing_id: listingId, buyer_id: buyerId, seller_id: sellerId, buyer_last_read_at: null, seller_last_read_at: null, created_at: new Date().toISOString() };
      state.conversations.push(conv);
    }
    return conv;
  }
  let state;
  try { const saved = JSON.parse(storage.getItem(key)); state = saved && Array.isArray(saved.listings) && Array.isArray(saved.audits) ? saved : fresh(); } catch { state = fresh(); }
  state.uploads ||= {}; state.names ||= {}; state.favorites ||= {}; state.purchases ||= []; state.revisions ||= []; state.slugs ||= {}; state.shippingAddresses ||= {}; state.phones ||= {}; state.smsOptIns ||= {}; state.messages ||= []; state.conversations ||= []; state.credits ||= []; state.supportMessages ||= []; state.refundRequests ||= []; state.buyRequests ||= []; state.sellerRatings ||= []; state.bids ||= []; state.reports ||= []; state.blocks ||= [];
  // "Pat Buyer Jones" -> "Pat J.", the way the real storefront shows reviewers.
const reviewerLabel = name => { const parts = String(name || '').trim().split(/\s+/).filter(Boolean); return !parts.length ? 'Collector' : parts.length === 1 ? parts[0] : parts[0] + ' ' + parts[parts.length - 1][0].toUpperCase() + '.'; };
const demoReview = r => { const purchase = state.purchases.find(p => p.id === r.purchase_id); const item = state.listings.find(x => x.id === purchase?.listing_id); return { id: r.id, rating: r.rating, comment: r.comment, created_at: r.created_at, reviewer: reviewerLabel(state.names[r.buyer_id] || DEMO_ACCOUNTS.find(u => u.id === r.buyer_id)?.display_name), item_title: item?.title || null }; };
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
    async updateSmsPreferences(phone,optIn) {
      requireUser();
      if(optIn) {
        const clean=String(phone||'').trim();
        if(!/^\+?[0-9]{10,15}$/.test(clean)) throw new Error('Enter a valid phone number.');
        state.phones[state.userId]=clean; state.smsOptIns[state.userId]=true;
      } else {
        state.smsOptIns[state.userId]=false;
      }
      save();
    },
    async extractCertificate() {throw new Error('AI reading requires the connected app and an AI service. Enter certificate details manually in this practice preview.');},
    async draftListing() {throw new Error('AI drafts require the connected app and an AI service. Fill in the details manually in this practice preview.');},
    async getTrivia() {return null;},
    async generateTrivia() {throw new Error('AI trivia requires the connected app and an AI service. Not available in this practice preview.');},
    async submitTriviaResponse() {throw new Error('AI trivia requires the connected app and an AI service. Not available in this practice preview.');},
    async getSession() { return session(); },
    onAuthChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async signInWithApple() { throw new Error('Sign in with Apple is not available in this practice preview.'); },
    async signIn(userId = DEMO_USER.id) { if (!DEMO_ACCOUNTS.some(user => user.id === userId)) throw new Error('Choose a practice account.'); state.userId = userId; save(); listeners.forEach(fn => fn(session())); },
    async signOut() { state.userId = null; save(); listeners.forEach(fn => fn(null)); },
    async profile() { requireUser(); return { ...currentUser(), display_name: state.names[state.userId] || currentUser().display_name, xp: state.xp[state.userId] || 0, learning_xp: 0, slug: state.slugs[state.userId] || null, shipping_address: state.shippingAddresses[state.userId] || null, phone_number: state.phones[state.userId] || null, sms_opt_in: !!state.smsOptIns[state.userId] }; },
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
    async shippingOptions(listingId) {
      const item=state.listings.find(x=>x.id===listingId);
      if(!item) return {options:[],free_shipping:false,locked:false,insured:false};
      const options=[{provider:'USPS',service:'usps_ground_advantage',name:'Ground Advantage',estimated_days:5,shipping_cents:704,insurance_cents:55},{provider:'USPS',service:'usps_priority',name:'Priority Mail',estimated_days:2,shipping_cents:1078,insurance_cents:55},{provider:'UPS',service:'ups_next_day_air',name:'Next Day Air',estimated_days:1,shipping_cents:4840,insurance_cents:55}].map(o=>({...o,total_cents:o.shipping_cents+o.insurance_cents}));
      return {options:item.free_shipping?options.slice(0,1).map(o=>({...o,shipping_cents:0,total_cents:o.insurance_cents})):options,free_shipping:!!item.free_shipping,locked:!!item.free_shipping,insured:true};
    },
    async startCheckout(listingId, shippingAddress, applyCreditCents, wantInsurance, fulfillmentMethod, shippingChoice, disclosureAck) {
      requireUser();
      const isPickup=fulfillmentMethod==='pickup';
      const item=state.listings.find(x=>x.id===listingId);
      const confirmedRequest=state.buyRequests.find(r=>r.listing_id===listingId && r.buyer_id===state.userId && r.status==='confirmed');
      if(!confirmedRequest) throw new Error('Ask the seller to confirm this item is still available before buying.');
      if(!item || item.status!=='pending') throw new Error('This item is not available to buy.');
      if(item.seller_id===state.userId) throw new Error('You cannot buy your own listing.');
      if(isPickup && !item.pickup_enabled) throw new Error('This item is not available for pickup.');
      if(!isPickup && !validAddress(shippingAddress)) throw new Error('Fill in all required address fields.');
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
      // Pickup never quotes shipping/insurance, same as the live edge function's branch.
      const hasParcel=!isPickup && item.weight_oz && item.length_in && item.width_in && item.height_in;
      const shippingCostCents=hasParcel ? 895 : 0;
      const sellerShippingCharge=item.free_shipping ? shippingCostCents : 0;
      const insured=hasParcel && wantInsurance!==false;
      const insuranceCostCents=insured ? 50 : 0;
      const conv=getOrCreateConversation(listingId,state.userId,item.seller_id);
      const purchase={id:crypto.randomUUID(),listing_id:listingId,buyer_id:state.userId,seller_id:item.seller_id,price_cents:item.price_cents,conversation_id:conv.id,
        platform_fee_cents:platformFeeCents,seller_shipping_charge_cents:sellerShippingCharge,seller_pays_shipping:!isPickup && !!item.free_shipping,
        seller_payout_cents:item.price_cents-platformFeeCents-sellerShippingCharge,
        shipping_cost_cents:shippingCostCents,applied_credit_cents:creditToApply,
        insured,insured_value_cents:insured?item.price_cents:0,insurance_cost_cents:insuranceCostCents,
        escrow_status:'held',funds_released_at:null,fulfillment_method:isPickup?'pickup':'ship',
        pickup_station_id:isPickup?item.pickup_station_id:null,seller_marked_picked_up_at:null,buyer_confirmed_pickup_at:null,
        created_at:new Date().toISOString(),shipping_address:isPickup?null:shippingAddress,tracking_status:'UNKNOWN',shipping_choice:isPickup?null:(shippingChoice||null)};
      state.purchases.push(purchase);
      if(creditToApply>0) state.credits.push({id:crypto.randomUUID(),user_id:state.userId,amount_cents:-creditToApply,reason:'Applied to checkout',created_at:new Date().toISOString()});
      item.status='sold';
      try{save();}catch(error){state.purchases.pop();item.status='active';if(creditToApply>0)state.credits.pop();throw error;}
      return {completed:true};
    },
    async pickupStations() { return DEMO_PICKUP_STATIONS; },
    async lookupCertificate(issuer, number) {
      const wanted = String(number || '').trim().toLowerCase();
      const rows = state.listings.filter(item => item.certificate_issuer === issuer && String(item.certificate_number || '').toLowerCase() === wanted && ['active','pending','sold'].includes(item.status));
      return { found: rows.length > 0, count: rows.length, issuer, number: String(number || '').trim(), listings: rows.map(item => ({ id: item.id, title: item.title, category: item.category, listed_at: item.created_at, status: item.status === 'active' ? 'For sale' : item.status === 'pending' ? 'Reserved' : 'Sold' })) };
    },
    async checkoutDisclosure() { return { requires_acknowledgement: false }; },
    async attestAuthenticity() {},
    async myCreditBalance() { requireUser(); return state.credits.filter(c=>c.user_id===state.userId).reduce((sum,c)=>sum+c.amount_cents,0); },
    async myPayoutStatus() {
      return state.purchases.filter(p=>p.buyer_id===state.userId || p.seller_id===state.userId).map(p=>({
        purchase_id:p.id,role:p.buyer_id===state.userId?'buyer':'seller',fulfillment_method:p.fulfillment_method || 'ship',escrow_status:p.escrow_status || 'held',
        delivered_at:p.delivered_at || null,release_after:p.release_after || null,hold_tier:p.hold_tier || null,under_review:false,has_open_dispute:state.refundRequests.some(r=>r.purchase_id===p.id && ['pending','contested','partial_offered','return_required','accepted'].includes(r.status)),can_release_early:false,
        handoff_verified_at:p.handoff_verified_at || null,
        inspection_accepted_at:p.inspection_accepted_at || null,
        pickup_code:p.buyer_id===state.userId && p.fulfillment_method==='pickup' && !p.handoff_verified_at && p.inspection_accepted_at ? '123456' : null,
        pickup_attempts_left:p.seller_id===state.userId && p.fulfillment_method==='pickup' ? 5 : null}));
    },
    async completePickup(purchaseId,code) {
      requireUser();
      const purchase=state.purchases.find(p=>p.id===purchaseId && p.seller_id===state.userId && p.fulfillment_method==='pickup');
      if(!purchase) throw new Error('Sale not found.');
      if(purchase.handoff_verified_at) throw new Error('This handoff is already complete.');
      if(!purchase.inspection_accepted_at) throw new Error('The buyer has not accepted the item yet. They inspect it first, then give you the code.');
      if(String(code||'').replace(/\s/g,'')!=='123456') return {ok:false,attempts_left:4};
      // No multi-day wait to model in demo mode, same reasoning buyShippingLabel already uses.
      purchase.handoff_verified_at=new Date().toISOString(); purchase.escrow_status='released'; purchase.funds_released_at=purchase.handoff_verified_at;
      save();
      return {ok:true,release_after:null,hold_tier:'new'};
    },
    async acceptDelivery(purchaseId) {
      requireUser();
      const purchase=state.purchases.find(p=>p.id===purchaseId && p.buyer_id===state.userId && p.fulfillment_method!=='pickup');
      if(!purchase || !purchase.delivered_at) throw new Error('This order is not waiting on a payout.');
      purchase.inspection_accepted_at=new Date().toISOString(); save();
      return {ok:true,released_early:false,release_after:purchase.release_after || null};
    },
    async acceptPickupInspection(purchaseId) {
      requireUser();
      const purchase=state.purchases.find(p=>p.id===purchaseId && p.buyer_id===state.userId && p.fulfillment_method==='pickup');
      if(!purchase) throw new Error('Purchase not found.');
      purchase.inspection_accepted_at=new Date().toISOString(); save();
      return {ok:true};
    },
    async rejectPickupInspection() { throw new Error('Not available in this practice preview.'); },
    async myPurchases() {
      requireUser();
      return state.purchases.filter(p=>p.buyer_id===state.userId).map(p=>{
        const item=state.listings.find(x=>x.id===p.listing_id) || {};
        const refund=state.refundRequests.find(r=>r.purchase_id===p.id);
        const rating=state.sellerRatings.find(r=>r.purchase_id===p.id);
        return {id:item.id,purchase_id:p.id,title:item.title,description:item.description,category:item.category,evidence:item.evidence,price_cents:p.price_cents,attributes:item.attributes,tags:item.tags,certificate_issuer:item.certificate_issuer,certificate_number:item.certificate_number,certificate_company:item.certificate_company,signature_ai_label:item.signature_ai_label || null,signature_ai_note:item.signature_ai_note || null,weight_oz:item.weight_oz || null,length_in:item.length_in || null,width_in:item.width_in || null,height_in:item.height_in || null,media:item.media || [],purchased_at:p.created_at,shipping_cost_cents:p.shipping_cost_cents || 0,tracking_number:p.tracking_number || null,tracking_url:p.tracking_url || null,tracking_status:p.tracking_status || 'UNKNOWN',shipped_at:p.shipped_at || null,escrow_status:p.escrow_status || 'held',insured:!!p.insured,insurance_cost_cents:p.insurance_cost_cents || 0,
          fulfillment_method:p.fulfillment_method || 'ship',seller_marked_picked_up_at:p.seller_marked_picked_up_at || null,buyer_confirmed_pickup_at:p.buyer_confirmed_pickup_at || null,
          pickup_station:p.fulfillment_method==='pickup' ? (DEMO_PICKUP_STATIONS.find(s=>s.id===p.pickup_station_id) || null) : null,
          refund_status:refund?.status || null,refund_reason:refund?.reason || null,refund_seller_response:refund?.seller_response || null,refund_request_id:refund?.id || null,offered_amount_cents:refund?.offered_amount_cents ?? null,return_tracking_number:refund?.return_tracking_number || null,return_tracking_url:refund?.return_tracking_url || null,return_label_url:refund?.return_label_url || null,return_shipped_at:refund?.return_shipped_at || null,return_tracking_status:refund?.return_tracking_status || 'UNKNOWN',conversation_id:p.conversation_id || null,message_count:state.messages.filter(m=>m.conversation_id===p.conversation_id).length,my_rating:rating?.rating ?? null,my_rating_comment:rating?.comment ?? null};
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
          fulfillment_method:p.fulfillment_method || 'ship',seller_marked_picked_up_at:p.seller_marked_picked_up_at || null,buyer_confirmed_pickup_at:p.buyer_confirmed_pickup_at || null,
          pickup_station:p.fulfillment_method==='pickup' ? (DEMO_PICKUP_STATIONS.find(s=>s.id===p.pickup_station_id) || null) : null,
          refund_status:refund?.status || null,refund_reason:refund?.reason || null,refund_seller_response:refund?.seller_response || null,refund_request_id:refund?.id || null,
          offered_amount_cents:refund?.offered_amount_cents ?? null,return_tracking_number:refund?.return_tracking_number || null,return_tracking_url:refund?.return_tracking_url || null,return_label_url:refund?.return_label_url || null,return_shipped_at:refund?.return_shipped_at || null,return_tracking_status:refund?.return_tracking_status || 'UNKNOWN',
          conversation_id:p.conversation_id || null,message_count:state.messages.filter(m=>m.conversation_id===p.conversation_id).length,
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
      // The buyer chose the shipping service at checkout, so that is the only one offered (cheapest when none was recorded).
      const services={usps_ground_advantage:['USPS','Ground Advantage',704,5],usps_priority:['USPS','Priority Mail',1078,2],ups_next_day_air:['UPS','Next Day Air',4840,1]};
      // Free-shipping listing: the seller picks any service and the real price comes out of their payout (like eBay).
      if(purchase.seller_pays_shipping) {
        const before=purchase.price_cents-purchase.platform_fee_cents;
        return Object.entries(services).map(([token,[provider,servicelevel,amount_cents,estimated_days]])=>({rate_id:'demo-'+token+'-'+purchaseId,provider,servicelevel,amount_cents,estimated_days,affordable:before-amount_cents>=0}));
      }
      const [provider,servicelevel,amount_cents,estimated_days]=services[purchase.shipping_choice?.service] || services.usps_ground_advantage;
      return [{rate_id:'demo-'+(purchase.shipping_choice?.service||'usps_ground_advantage')+'-'+purchaseId,provider,servicelevel,amount_cents,estimated_days}];
    },
    async buyShippingLabel(purchaseId, rateId) {
      requireUser();
      const purchase=state.purchases.find(p=>p.id===purchaseId && p.seller_id===state.userId);
      if(!purchase) throw new Error('Sale not found.');
      // Demo mode has no real async tracking to simulate delivery over days, so shipping a label
      // here also immediately simulates delivery and releases escrow -- good enough to preview
      // the UI/stats without modeling a multi-day wait.
      const shipped={shippo_transaction_id:'demo-'+rateId,tracking_number:'DEMO'+Math.floor(Math.random()*1e9),tracking_url:'https://example.com/track/demo',label_url:'https://example.com/label/demo.pdf',shipped_at:new Date().toISOString(),escrow_status:'released',funds_released_at:new Date().toISOString()};
      if(purchase.seller_pays_shipping) {
        const prices={usps_ground_advantage:704,usps_priority:1078,ups_next_day_air:4840};
        const token=Object.keys(prices).find(key=>String(rateId).startsWith('demo-'+key+'-'));
        if(token) { purchase.seller_shipping_charge_cents=prices[token]; purchase.seller_payout_cents=purchase.price_cents-purchase.platform_fee_cents-prices[token]; }
      }
      Object.assign(purchase,shipped); save();
      return shipped;
    },
    async getMessages(conversationId) {
      requireUser();
      const conv=state.conversations.find(c=>c.id===conversationId && (c.buyer_id===state.userId || c.seller_id===state.userId));
      if(!conv) throw new Error('Conversation not found.');
      return state.messages.filter(m=>m.conversation_id===conversationId).map(m=>({...m,sender_name:state.names[m.sender_id] || DEMO_ACCOUNTS.find(user=>user.id===m.sender_id)?.display_name || 'Collector'}));
    },
    async sendMessage(conversationId, body) {
      requireUser();
      const conv=state.conversations.find(c=>c.id===conversationId && (c.buyer_id===state.userId || c.seller_id===state.userId));
      if(!conv) throw new Error('Conversation not found.');
      const other=conv.buyer_id===state.userId ? conv.seller_id : conv.buyer_id;
      if((state.blocks || []).some(b=>(b.blocker_id===state.userId && b.blocked_id===other) || (b.blocker_id===other && b.blocked_id===state.userId))) throw new Error('You cannot message this user.');
      const clean=String(body || '').trim();
      if(!clean || clean.length>2000) throw new Error('Write a message between 1 and 2000 characters.');
      const message={id:crypto.randomUUID(),conversation_id:conversationId,sender_id:state.userId,body:clean,created_at:new Date().toISOString()};
      state.messages.push(message); save();
      return {...message,sender_name:state.names[state.userId] || currentUser().display_name};
    },
    async markMessagesRead(conversationId) {
      requireUser();
      const conv=state.conversations.find(c=>c.id===conversationId && (c.buyer_id===state.userId || c.seller_id===state.userId));
      if(!conv) throw new Error('Conversation not found.');
      const now=new Date().toISOString();
      if(conv.buyer_id===state.userId) conv.buyer_last_read_at=now;
      if(conv.seller_id===state.userId) conv.seller_last_read_at=now;
      save();
    },
    async getOrCreateConversation(listingId) {
      requireUser();
      const item=state.listings.find(x=>x.id===listingId);
      if(!item) throw new Error('Listing not found.');
      if(item.seller_id===state.userId) throw new Error('You cannot message yourself about your own listing.');
      if((state.blocks || []).some(b=>(b.blocker_id===state.userId && b.blocked_id===item.seller_id) || (b.blocker_id===item.seller_id && b.blocked_id===state.userId))) throw new Error('You cannot message this seller.');
      const conv=getOrCreateConversation(listingId,state.userId,item.seller_id);
      save();
      return {id:conv.id,listing_id:item.id,listing_title:item.title,listing_status:item.status,listing_price_cents:item.price_cents,media:(item.media||[]).filter(asset=>asset.kind==='item').slice(0,1)};
    },
    async listConversations() {
      requireUser();
      return state.conversations.filter(c=>c.buyer_id===state.userId || c.seller_id===state.userId)
        .filter(c=>{
          const mine=c.buyer_id===state.userId;
          const clearedAt=mine?c.buyer_cleared_at:c.seller_cleared_at;
          if(!clearedAt) return true;
          const m=state.messages.filter(x=>x.conversation_id===c.id);
          const activityAt=m.length?m[m.length-1].created_at:c.created_at;
          return activityAt>clearedAt;
        })
        .slice().sort((a,b)=>{
          const lastOf=c=>{const m=state.messages.filter(x=>x.conversation_id===c.id); return m.length?m[m.length-1].created_at:c.created_at;};
          return lastOf(b).localeCompare(lastOf(a));
        })
        .map(c=>{
          const item=state.listings.find(x=>x.id===c.listing_id) || {};
          const mine=c.buyer_id===state.userId;
          const lastRead=mine?c.buyer_last_read_at:c.seller_last_read_at;
          const convMessages=state.messages.filter(m=>m.conversation_id===c.id).sort((a,b)=>a.created_at<b.created_at?-1:1);
          const last=convMessages[convMessages.length-1];
          return {id:c.id,listing_id:item.id,listing_title:item.title,listing_status:item.status,listing_price_cents:item.price_cents,
            role:mine?'buyer':'seller',counterparty_name:state.names[mine?c.seller_id:c.buyer_id] || DEMO_ACCOUNTS.find(u=>u.id===(mine?c.seller_id:c.buyer_id))?.display_name || 'Collector',
            last_message_at:last?.created_at || null,last_message_body:last?.body || null,
            unread:!!(last && last.sender_id!==state.userId && (!lastRead || last.created_at>lastRead)),
            media:(item.media||[]).filter(asset=>asset.kind==='item').slice(0,1),
            pickup_enabled:!!item.pickup_enabled,
            pickup_station:item.pickup_enabled ? (DEMO_PICKUP_STATIONS.find(s=>s.id===item.pickup_station_id) || null) : null};
        });
    },
    async clearConversation(conversationId) {
      requireUser();
      const conv=state.conversations.find(c=>c.id===conversationId && (c.buyer_id===state.userId || c.seller_id===state.userId));
      if(!conv) throw new Error('Conversation not found.');
      const now=new Date().toISOString();
      if(conv.buyer_id===state.userId) conv.buyer_cleared_at=now;
      if(conv.seller_id===state.userId) conv.seller_cleared_at=now;
      save();
    },
    async myNotifications() {
      requireUser();
      const notifications=[];
      for(const p of state.purchases) {
        const item=state.listings.find(x=>x.id===p.listing_id);
        if(!item) continue;
        const refund=state.refundRequests.find(r=>r.purchase_id===p.id);
        if(refund?.seller_id===state.userId && refund.status==='pending') notifications.push({kind:'refund_pending',role:'seller',purchase_id:p.id,listing_id:item.id,title:item.title,message:`Refund requested for "${item.title}"`,conversation_id:null});
        if(refund?.buyer_id===state.userId && refund.status==='partial_offered') notifications.push({kind:'partial_offered',role:'buyer',purchase_id:p.id,listing_id:item.id,title:item.title,message:`Partial refund offered for "${item.title}"`,conversation_id:null});
        if(refund?.buyer_id===state.userId && refund.status==='return_required' && !refund.return_shipped_at) notifications.push({kind:'return_required',role:'buyer',purchase_id:p.id,listing_id:item.id,title:item.title,message:`Ship "${item.title}" back to get your refund`,conversation_id:null});
      }
      for(const p of state.purchases) {
        if(p.seller_id!==state.userId || p.fulfillment_method==='pickup' || p.escrow_status!=='held' || p.shipped_at) continue;
        const item=state.listings.find(x=>x.id===p.listing_id);
        if(item) notifications.push({kind:'ship_pending',role:'seller',purchase_id:p.id,listing_id:item.id,title:item.title,message:`Ship "${item.title}" — your buyer is waiting`,conversation_id:null});
      }
      for(const c of state.conversations) {
        const item=state.listings.find(x=>x.id===c.listing_id);
        if(!item) continue;
        const messages=state.messages.filter(m=>m.conversation_id===c.id);
        if(c.seller_id===state.userId) {
          const lastFromBuyer=messages.filter(m=>m.sender_id===c.buyer_id).reduce((max,m)=>m.created_at>max?m.created_at:max,'');
          if(lastFromBuyer && (!c.seller_last_read_at || lastFromBuyer>c.seller_last_read_at)) notifications.push({kind:'message',role:'seller',purchase_id:null,listing_id:item.id,title:item.title,message:`New message about "${item.title}"`,conversation_id:c.id});
        }
        if(c.buyer_id===state.userId) {
          const lastFromSeller=messages.filter(m=>m.sender_id===c.seller_id).reduce((max,m)=>m.created_at>max?m.created_at:max,'');
          if(lastFromSeller && (!c.buyer_last_read_at || lastFromSeller>c.buyer_last_read_at)) notifications.push({kind:'message',role:'buyer',purchase_id:null,listing_id:item.id,title:item.title,message:`New message about "${item.title}"`,conversation_id:c.id});
        }
      }
      for(const r of state.buyRequests) {
        const item=state.listings.find(x=>x.id===r.listing_id);
        if(!item) continue;
        if(r.seller_id===state.userId && r.status==='pending') notifications.push({kind:'buy_request_pending',role:'seller',purchase_id:null,listing_id:item.id,title:item.title,message:`Confirm "${item.title}" is still available`,conversation_id:null});
        if(r.buyer_id===state.userId && r.status==='confirmed') notifications.push({kind:'buy_request_confirmed',role:'buyer',purchase_id:null,listing_id:item.id,title:item.title,message:`"${item.title}" is confirmed available — complete your purchase`,conversation_id:null});
      }
      return notifications;
    },
    async getSupportMessages() { requireUser(); return state.supportMessages.filter(m=>m.user_id===state.userId); },
    async sendSupportMessage() { requireUser(); throw new Error('AI chat requires the connected app and an AI service. Not available in this practice preview.'); },
    async reportBug(what, steps) {
      requireUser();
      const clean=String(what||'').trim();
      if(!clean || clean.length>2000) throw new Error('Tell us what went wrong, in 1 to 2000 characters.');
      const now=new Date().toISOString();
      const user_message={id:crypto.randomUUID(),user_id:state.userId,role:'user',kind:'bug',body:'Bug report: '+clean+(String(steps||'').trim()?'\n\nWhat I was doing: '+String(steps).trim():''),created_at:now};
      const assistant_message={id:crypto.randomUUID(),user_id:state.userId,role:'assistant',kind:'bug',body:'Thank you for telling us. Your report has gone straight to the Credabilia team and a person will look at it. You can keep using the site, and we will reply here if we need more detail.',created_at:now};
      state.supportMessages.push(user_message,assistant_message); save();
      return {user_message,assistant_message};
    },
    async requestHumanCallback() { requireUser(); throw new Error('Callback requests require the connected app. Not available in this practice preview.'); },
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
    async adminPurchaseEvidence() { return null; },
    async adminListCertificatesToCheck() { requireUser(); return []; },
    async adminSetCertificateChecked() { requireUser(); throw new Error('Checking a certificate needs the connected app.'); },
    async adminOrderRiskQueue() { requireUser(); return []; },
    async adminAddOrderNote() { requireUser(); throw new Error('Order notes need the connected app.'); },
    async adminClearReviewHold() { requireUser(); throw new Error('Clearing a hold needs the connected app.'); },
    async adminMemberFlags() { requireUser(); return []; },
    async adminBanUser() { throw new Error('Needs the connected app.'); },
    async adminUnbanUser() { throw new Error('Needs the connected app.'); },
    async adminSetPayoutReview() { throw new Error('Needs the connected app.'); },
    async adminListSignatureReferences() { requireUser(); return []; },
    async adminPromoteSignatureReference() { throw new Error('The admin dashboard requires the connected app. Not available in this practice preview.'); },
    async adminRenameSignatureReference() { throw new Error('The admin dashboard requires the connected app. Not available in this practice preview.'); },
    async adminAssignSignatureReference() { throw new Error('The admin dashboard requires the connected app. Not available in this practice preview.'); },
    async adminListSignatureSubjects() { requireUser(); return []; },
    async adminRenameSignatureSubject() { throw new Error('The admin dashboard requires the connected app. Not available in this practice preview.'); },
    async adminMergeSignatureSubjects() { throw new Error('The admin dashboard requires the connected app. Not available in this practice preview.'); },
    async adminRemoveSignatureAlias() { throw new Error('The admin dashboard requires the connected app. Not available in this practice preview.'); },
    async searchSignatureSubjects() { return []; },
    async adminDiscardSignatureReference() { throw new Error('The admin dashboard requires the connected app. Not available in this practice preview.'); },
    async adminListNeedsReviewListings() { requireUser(); return []; },
    async adminApproveListing() { throw new Error('The admin dashboard requires the connected app. Not available in this practice preview.'); },
    async adminRejectListing() { throw new Error('The admin dashboard requires the connected app. Not available in this practice preview.'); },
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
    async getSellerReviews(slug, limit=20, offset=0) {
      const clean=String(slug || '').trim().toLowerCase();
      const userId=Object.entries(state.slugs).find(([,value])=>value===clean)?.[0];
      if(!userId) return null;
      const {avg,count}=sellerRatingStats(userId);
      const all=state.sellerRatings.filter(r=>r.seller_id===userId).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
      return {rating_avg:avg,rating_count:count,reviews:all.slice(offset,offset+limit).map(r=>demoReview(r))};
    },
    async getListingSellerReviews(listingId, limit=5, offset=0) {
      const listing=state.listings.find(item=>item.id===listingId);
      if(!listing) return null;
      const slug=state.slugs[listing.seller_id] || null;
      const {avg,count}=sellerRatingStats(listing.seller_id);
      const all=state.sellerRatings.filter(r=>r.seller_id===listing.seller_id).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
      return {seller_name:listing.seller_name || 'Collector',slug,rating_avg:avg,rating_count:count,reviews:all.slice(offset,offset+limit).map(r=>demoReview(r))};
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
          .map(r=>demoReview(r)),
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
    async soldListing(id) {
      const item = state.listings.find(x => x.id === id && x.status === 'sold');
      return item ? { id: item.id, title: item.title, category: item.category, media: item.media?.[0] ? [{ path: item.media[0].path, url: item.media[0].url }] : [] } : null;
    },
    async listings(after) {
      const scored = state.listings.filter(item => item.status === 'active' || (item.status === 'needs_review' && item.seller_id === state.userId)).map(item => { const current=state.audits.filter(a => a.listing_id === item.id && (a.listing_version||1) === (item.version||1)); const {avg,count}=sellerRatingStats(item.seller_id); const signed=item.media?.some(asset=>asset.kind==='signature'); return { ...item, ...(signed ? credibilityScore(item,current) : {}), audit_count: current.length, seller_member_since:new Date().toISOString(), seller_sales_count:state.purchases.filter(p=>p.seller_id===item.seller_id).length, seller_rating_avg:avg, seller_rating_count:count }; })
        .sort((a,b) => a.created_at === b.created_at ? (a.id < b.id ? 1 : -1) : (a.created_at < b.created_at ? 1 : -1));
      if (!after) return scored;
      const idx = scored.findIndex(item => item.created_at === after.created_at && item.id === after.id);
      return idx === -1 ? [] : scored.slice(idx + 1);
    },
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
      const item = { ...value, media, id: crypto.randomUUID(), seller_id: state.userId, seller_name: currentUser().display_name, status: input.needs_review ? 'needs_review' : 'active', needs_review_reason: input.needs_review_reason || null, created_at: new Date().toISOString(), artwork: 'generic', audit_count: 0,
        listing_type: isAuction ? 'auction' : 'fixed', bid_count: 0, auction_ends_at: isAuction ? new Date(Date.now()+Number(input.auction_days)*24*60*60*1000).toISOString() : null,
        signature_ai_label: input.signature_ai_label || null, signature_ai_note: input.signature_ai_note || null };
      state.listings.unshift(item); try {save();} catch(error) {state.listings.shift();throw error;} return item.id;
    },
    async myEndedListings() { requireUser(); return state.listings.filter(l=>l.seller_id===state.userId && l.status==='archived' && l.archived_reason).map(l=>({id:l.id,title:l.title,category:l.category,price_cents:l.price_cents,listing_type:l.listing_type,bid_count:l.bid_count||0,reason:l.archived_reason,media:l.media||[]})); },
    async relistEndedListing(id, type, priceCents, auctionDays) {
      requireUser();
      const item=state.listings.find(x=>x.id===id && x.seller_id===state.userId && x.status==='archived' && x.archived_reason);
      if(!item) throw new Error('This listing cannot be relisted.');
      Object.assign(item,{status:'active',archived_reason:null,listing_type:type,price_cents:priceCents,bid_count:0,demo_high:undefined,auction_ends_at:type==='auction'?new Date(Date.now()+Number(auctionDays)*86400000).toISOString():null});
      save(); return id;
    },
    async changeListingType(id, type, auctionDays) {
      requireUser();
      const item=state.listings.find(x=>x.id===id && x.seller_id===state.userId);
      if(!item || item.status!=='active') throw new Error('Only a live listing can be switched.');
      if(item.listing_type===type) throw new Error('This listing is already '+(type==='auction'?'an auction':'fixed price')+'.');
      if((item.bid_count||0)>0) throw new Error('This auction already has bids, so it cannot be switched.');
      item.listing_type=type; item.auction_ends_at=type==='auction'?new Date(Date.now()+Number(auctionDays)*86400000).toISOString():null; item.demo_high=undefined;
      save();
    },
    async placeBid(listingId, amountCents) {
      requireUser();
      const item=state.listings.find(x=>x.id===listingId);
      if(!item || item.status!=='active' || item.listing_type!=='auction') throw new Error('This auction is not available for bidding.');
      if(new Date(item.auction_ends_at)<=new Date()) throw new Error('This auction has ended.');
      if(item.seller_id===state.userId) throw new Error('You cannot bid on your own listing.');
      // Same rules as the live database: the bid is a maximum, the price moves by eBay-style steps, and a bid in the last 5 minutes
      // extends the auction by 5 minutes. (Demo mode has no card step, so any signed-in practice account can bid.)
      const fmt=cents=>'$'+(cents/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
      const note=(bidderId,price,max,auto=false)=>(state.bids ||= []).push({id:crypto.randomUUID(),listing_id:listingId,bidder_id:bidderId,amount_cents:price,max_cents:max,is_auto:auto,created_at:new Date().toISOString()});
      const high=item.demo_high;
      let price=item.price_cents, outbidNow=false;
      if(!high) {
        if(amountCents<item.price_cents) throw new Error('Your bid must be at least the starting bid of '+fmt(item.price_cents)+'.');
        item.demo_high={bidder_id:state.userId,max:amountCents}; note(state.userId,price,amountCents); item.bid_count+=1;
      } else if(high.bidder_id===state.userId) {
        if(amountCents<=high.max) throw new Error('Your new maximum must be higher than your current maximum of '+fmt(high.max)+'.');
        high.max=amountCents;
      } else {
        const need=price+auctionIncrement(price);
        if(amountCents<need) throw new Error('Enter at least '+fmt(need)+'.');
        if(amountCents>high.max) {
          price=Math.min(amountCents,high.max+auctionIncrement(high.max));
          if(high.max>item.price_cents) note(high.bidder_id,high.max,high.max,true);
          note(state.userId,price,amountCents);
          item.demo_high={bidder_id:state.userId,max:amountCents};
        } else {
          price=Math.min(high.max,amountCents+auctionIncrement(amountCents));
          note(state.userId,amountCents,amountCents); note(high.bidder_id,price,high.max,true); outbidNow=true;
        }
        item.price_cents=price; item.bid_count+=1;
      }
      let extended=false;
      if(new Date(item.auction_ends_at)-Date.now()<=5*60*1000) { item.auction_ends_at=new Date(Date.now()+5*60*1000).toISOString(); extended=true; }
      save();
      return {amount_cents:item.price_cents,bid_count:item.bid_count,is_high_bidder:!outbidNow,my_max_cents:amountCents,outbid_by_existing_maximum:outbidNow,extended,auction_ends_at:item.auction_ends_at};
    },
    async myBidStatus(listingId) {
      requireUser();
      const item=state.listings.find(x=>x.id===listingId);
      const mine=(state.bids||[]).filter(b=>b.listing_id===listingId && b.bidder_id===state.userId && !b.is_auto).map(b=>b.max_cents);
      return {can_bid:true,reason:null,is_high_bidder:item?.demo_high?.bidder_id===state.userId,my_max_cents:item?.demo_high?.bidder_id===state.userId?item.demo_high.max:(mine.length?Math.max(...mine):null)};
    },
    async setupBiddingCard() { throw new Error('Saving a card is not needed in this practice preview.'); },
    async editListing(original,input,mediaTouched,fit) {
      requireUser();
      const item=state.listings.find(x=>x.id===original.id);
      if(!item || item.seller_id!==state.userId || !currentUser().can_sell) throw new Error('You can only edit your own listing.');
      if(!['active','needs_review'].includes(item.status)) throw new Error('Only active listings can be edited.');
      if(JSON.stringify(editableFields(item))!==JSON.stringify(editableFields(original))) throw new Error('This listing changed. Reopen it before editing.');
      const value=editableFields(listingInput(input,{requirePackage:false}));
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
      Object.assign(item,value,certificate,{media,signature_ai_label:input.signature_ai_label||null,signature_ai_note:input.signature_ai_note||null},
        fit ? {status:fit.needs_review?'needs_review':'active',needs_review_reason:fit.needs_review_reason||null} : {});
      try{save();}catch(error){Object.assign(item,before);state.revisions.pop();throw error;}
    },
    async deleteListing(id) {
      requireUser();
      const item=state.listings.find(x=>x.id===id);
      if(!item || item.seller_id!==state.userId) throw new Error('You can only delete your own listing.');
      if(!currentUser().can_sell) throw new Error('Selling permission required.');
      if(item.status!=='active') throw new Error('Only active listings can be deleted.');
      item.status='archived';
      save();
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
