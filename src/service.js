import { mediaInput } from './media.js';
import { editableFields } from './listingEdits.js';
import { createClient } from '@supabase/supabase-js';
import { createDemoService } from './demo.js';
import { listingInput, auditInput } from './domain.js';
import { pushSupported, currentPushSubscription, enablePush, disablePush } from './push.js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const demo = import.meta.env.VITE_DEMO_MODE === 'true' || (import.meta.env.DEV && !url && !key);
function unwrap({ data, error }) { if (error) throw error; return data; }

export function makeService() {
  if (demo) return createDemoService();
  if (!url || !key) return { mode: 'unconfigured' };
  const client = createClient(url, key, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } });
  async function signMedia(items) {
    const paths=items.flatMap(item=>(item.media || []).map(asset=>asset.path));
    if(!paths.length) return items;
    const {data}=await client.storage.from('listing-media').createSignedUrls(paths,3600);
    const urls=new Map((data || []).map(asset=>[asset.path,asset.signedUrl]));
    return items.map(item=>({...item,media:(item.media || []).map(asset=>({...asset,url:urls.get(asset.path)||null}))}));
  }
  return {
    mode: 'live', detailsEnabled: import.meta.env.VITE_LISTING_DETAILS_ENABLED === 'true',
    async getSession() {
      const session = unwrap(await client.auth.getSession()).session;
      // SDK exchanges a PKCE callback during initialization; remove the spent code from the address bar.
      if (session && window.location.search.includes('code=')) window.history.replaceState({}, '', window.location.pathname);
      return session;
    },
    onAuthChange(fn) { const { data } = client.auth.onAuthStateChange((_event, session) => fn(session)); return () => data.subscription.unsubscribe(); },
    async signIn() { unwrap(await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } })); },
    async signInWithEmail(email) {
      unwrap(await client.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/auth/callback` } }));
    },
    async signOut() { const { error } = await client.auth.signOut(); if (error) throw error; },
    async profile(userId) {
      const [profile, permission, progress, stripeAccount] = await Promise.all([
        client.from('profiles').select('id,display_name,slug,shipping_address').eq('id', userId).single(),
        client.from('account_permissions').select('can_sell,can_audit').eq('user_id', userId).single(),
        client.from('user_progress').select('xp,learning_xp').eq('user_id', userId).single(),
        client.from('stripe_accounts').select('charges_enabled,details_submitted').eq('user_id', userId).maybeSingle(),
      ]);
      const stripe = unwrap(stripeAccount);
      return { ...unwrap(profile), ...unwrap(permission), ...unwrap(progress),
        stripe_charges_enabled: stripe?.charges_enabled || false, stripe_details_submitted: stripe?.details_submitted || false };
    },
    async listings() { return signMedia(unwrap(await client.rpc('browse_listings_with_certificates'))); },
    async uploadImage(blob,kind) {
      const user=unwrap(await client.auth.getUser()).user;
      if(!user) throw new Error('Sign in to add photos.');
      const path=user.id+'/'+crypto.randomUUID()+'.jpg';
      unwrap(await client.storage.from('listing-media').upload(path,blob,{contentType:'image/jpeg',upsert:false}));
      const signed=unwrap(await client.storage.from('listing-media').createSignedUrl(path,3600));
      return {path,kind,url:signed.signedUrl};
    },
    async removeImage(path) {
      // Best-effort: an already-published photo can't be deleted from storage (immutable evidence policy);
      // edit_listing() still detaches it from the listing server-side when the seller updates their photos.
      await client.storage.from('listing-media').remove([path]);
    },
    async removeBackground(path) {
      const {data,error}=await client.functions.invoke('remove-background',{body:{path}});
      if(error) { let detail; try {detail=await error.context?.json();} catch {} throw new Error(detail?.error || 'Could not remove the background right now.'); }
      const user=unwrap(await client.auth.getUser()).user;
      if(!user) throw new Error('Sign in to add photos.');
      const newPath=user.id+'/'+crypto.randomUUID()+'.png';
      // storage-js reads the upload body's own Blob.type when the body is already a Blob, ignoring
      // the contentType option below -- data's type is application/octet-stream (from the edge
      // function response), so it must be re-wrapped with the real type before uploading.
      const png=new Blob([data],{type:'image/png'});
      unwrap(await client.storage.from('listing-media').upload(newPath,png,{contentType:'image/png',upsert:false}));
      const signed=unwrap(await client.storage.from('listing-media').createSignedUrl(newPath,3600));
      await client.storage.from('listing-media').remove([path]).catch(()=>{});
      return {path:newPath,kind:'item',url:signed.signedUrl};
    },
    async extractCertificate(path) {
      const {data,error}=await client.functions.invoke('extract-certificate',{body:{path}});
      if(error) { let detail; try {detail=await error.context?.json();} catch {} throw new Error(detail?.error || 'Certificate reading is not available yet. Enter the details manually.'); }
      return data;
    },
    async draftListing({notes,photoPath}) {
      const {data,error}=await client.functions.invoke('draft-listing',{body:{notes,photo_path:photoPath}});
      if(error) { let detail; try {detail=await error.context?.json();} catch {} throw new Error(detail?.error || 'AI listing drafts are not available yet. Fill in the details manually.'); }
      return data;
    },
    async pushSubscriptionStatus() {
      const subscription=await currentPushSubscription();
      return {supported:pushSupported(),subscribed:!!subscription};
    },
    async enableNotifications() {
      const vapidKey=import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if(!vapidKey) throw new Error('Push notifications are not connected yet.');
      const subscription=await enablePush(vapidKey);
      const json=subscription.toJSON();
      unwrap(await client.rpc('save_push_subscription',{p_endpoint:json.endpoint,p_p256dh:json.keys.p256dh,p_auth:json.keys.auth}));
    },
    async disableNotifications() {
      const subscription=await disablePush();
      if(subscription) await client.rpc('remove_push_subscription',{p_endpoint:subscription.endpoint}).catch(()=>{});
    },
    async myAudits() { return unwrap(await client.from('audits').select('id,listing_id,verdict,explanation,created_at,listing_version').order('created_at', { ascending: false })); },
    async getTrivia(listingId) { return unwrap(await client.rpc('get_listing_trivia', { p_listing_id: listingId })); },
    async generateTrivia(listingId) {
      const {data,error}=await client.functions.invoke('generate-trivia',{body:{listing_id:listingId}});
      if(error) { let detail; try {detail=await error.context?.json();} catch {} throw new Error(detail?.error || 'AI trivia is not available yet.'); }
      return data;
    },
    async submitTriviaResponse(listingId, selectedIndex) {
      return unwrap(await client.rpc('submit_trivia_response', { p_listing_id: listingId, p_selected_index: selectedIndex }));
    },
    async createListing(input) {
      const value = listingInput(input);
      const detailsEnabled = import.meta.env.VITE_LISTING_DETAILS_ENABLED === 'true';
      return unwrap(await client.rpc(detailsEnabled ? 'create_listing_with_details' : 'create_listing_with_media', { ...(detailsEnabled ? {p_attributes:value.attributes,p_tags:value.tags,p_weight_oz:value.weight_oz,p_length_in:value.length_in,p_width_in:value.width_in,p_height_in:value.height_in,p_free_shipping:value.free_shipping,p_listing_type:input.listing_type==='auction'?'auction':'fixed',p_auction_days:input.listing_type==='auction'?Number(input.auction_days):null} : {}), p_title: value.title, p_description: value.description, p_category: value.category, p_price_cents: value.price_cents, p_evidence: value.evidence, p_issuer: value.certificate_issuer, p_number: value.certificate_number, p_company: value.certificate_company, p_media: mediaInput(input.media) }));
    },
    async placeBid(listingId, amountCents) { return unwrap(await client.rpc('place_bid', { p_listing_id: listingId, p_amount_cents: amountCents })); },
    async editListing(item,input,mediaTouched) {
      const v=listingInput(input);
      unwrap(await client.rpc('edit_listing',{p_id:item.id,p_title:v.title,p_description:v.description,p_category:v.category,p_price_cents:v.price_cents,p_evidence:v.evidence,
        p_issuer:v.certificate_issuer,p_number:v.certificate_number,p_company:v.certificate_company,
        p_media:mediaTouched?mediaInput(input.media):null,p_expected:editableFields(item)}));
    },
    async getListingHistory(listingId) { return signMedia((unwrap(await client.rpc('get_listing_history',{p_listing_id:listingId}))).map(v=>({...v,media:v.media||[]}))); },
    async submitAudit(listingId, input) {
      const value = auditInput(input);
      return unwrap(await client.rpc('submit_audit', { p_listing_id: listingId, p_verdict: value.verdict, p_explanation: value.explanation }));
    },
    async updateProfile(displayName) { unwrap(await client.rpc('update_profile', { p_display_name: displayName })); },
    async toggleFavorite(listingId) { return unwrap(await client.rpc('toggle_favorite', { p_listing_id: listingId })); },
    async myFavoriteIds() { return unwrap(await client.rpc('my_favorite_ids')); },
    async myPurchases() { return signMedia(unwrap(await client.rpc('my_purchases'))); },
    async rateSeller(purchaseId, rating, comment) { return unwrap(await client.rpc('rate_seller', { p_purchase_id: purchaseId, p_rating: rating, p_comment: comment || null })); },
    async startStripeOnboarding() {
      const {data,error}=await client.functions.invoke('stripe-connect-onboarding',{body:{}});
      if(error) { let detail; try {detail=await error.context?.json();} catch {} throw new Error(detail?.error || 'Stripe onboarding is not available right now.'); }
      return data;
    },
    async refreshStripeOnboardingStatus() {
      const {data,error}=await client.functions.invoke('stripe-connect-status',{body:{}});
      if(error) { let detail; try {detail=await error.context?.json();} catch {} throw new Error(detail?.error || 'Could not check payout status.'); }
      return data;
    },
    async openStripeDashboard() {
      const {data,error}=await client.functions.invoke('stripe-connect-dashboard-link',{body:{}});
      if(error) { let detail; try {detail=await error.context?.json();} catch {} throw new Error(detail?.error || 'Could not open your Stripe dashboard.'); }
      return data;
    },
    async requestToBuy(listingId) { return unwrap(await client.rpc('request_to_buy', { p_listing_id: listingId })); },
    async respondToBuyRequest(requestId, available) { return unwrap(await client.rpc('respond_to_buy_request', { p_request_id: requestId, p_available: available })); },
    async myOpenBuyRequests() { return signMedia(unwrap(await client.rpc('my_open_buy_requests'))); },
    async myBuyRequests() { return signMedia(unwrap(await client.rpc('my_buy_requests'))); },
    async startCheckout(listingId, shippingAddress, applyCreditCents, wantInsurance) {
      const {data,error}=await client.functions.invoke('create-checkout-session',{body:{listing_id:listingId,shipping_address:shippingAddress,apply_credit_cents:applyCreditCents||0,want_insurance:wantInsurance!==false}});
      if(error) { let detail; try {detail=await error.context?.json();} catch {} throw new Error(detail?.error || 'This item could not be purchased right now.'); }
      return data;
    },
    async myCreditBalance() { return unwrap(await client.rpc('my_credit_balance')); },
    async confirmCheckout(stripeSessionId) {
      const {data,error}=await client.functions.invoke('confirm-checkout',{body:{stripe_session_id:stripeSessionId}});
      if(error) { let detail; try {detail=await error.context?.json();} catch {} throw new Error(detail?.error || 'Could not confirm your purchase.'); }
      return data;
    },
    async cancelCheckout(stripeSessionId) { return unwrap(await client.rpc('cancel_checkout_session', { p_stripe_session_id: stripeSessionId })); },
    async markListingRelisted(listingId, purchaseId) { unwrap(await client.rpc('mark_listing_relisted', { p_listing_id: listingId, p_purchase_id: purchaseId })); },
    async getStorefront(slug) {
      const storefront = unwrap(await client.rpc('get_storefront', { p_slug: slug }));
      if (!storefront) return null;
      return { ...storefront, listings: await signMedia(storefront.listings) };
    },
    async updateStoreSlug(slug) { unwrap(await client.rpc('update_store_slug', { p_slug: slug })); },
    async myDashboardStats() { return unwrap(await client.rpc('my_dashboard_stats')); },
    async saveShippingAddress(address) { unwrap(await client.rpc('save_shipping_address', { p_address: address })); },
    async validateAddress(address) {
      const {data,error}=await client.functions.invoke('validate-address',{body:{address}});
      if(error) { let detail; try {detail=await error.context?.json();} catch {} throw new Error(detail?.error || 'Could not verify this address right now.'); }
      return data;
    },
    async mySales() { return signMedia(unwrap(await client.rpc('my_sales'))); },
    async getShippingRates(purchaseId, parcel) {
      const {data,error}=await client.functions.invoke('shippo-get-rates',{body:{purchase_id:purchaseId,parcel}});
      if(error) { let detail; try {detail=await error.context?.json();} catch {} throw new Error(detail?.error || 'Could not get shipping rates right now.'); }
      return data.rates;
    },
    async buyShippingLabel(purchaseId, rateId) {
      const {data,error}=await client.functions.invoke('shippo-buy-label',{body:{purchase_id:purchaseId,rate_id:rateId}});
      if(error) { let detail; try {detail=await error.context?.json();} catch {} throw new Error(detail?.error || 'Could not buy this label right now.'); }
      return data;
    },
    async getMessages(purchaseId) { return unwrap(await client.rpc('get_messages', { p_purchase_id: purchaseId })); },
    async sendMessage(purchaseId, body) { return unwrap(await client.rpc('send_message', { p_purchase_id: purchaseId, p_body: body })); },
    async markMessagesRead(purchaseId) { return unwrap(await client.rpc('mark_messages_read', { p_purchase_id: purchaseId })); },
    async myNotifications() { return unwrap(await client.rpc('my_notifications')); },
    async getSupportMessages() { return unwrap(await client.rpc('get_support_messages')); },
    async sendSupportMessage(body) {
      const {data,error}=await client.functions.invoke('support-chat',{body:{body}});
      if(error) { let detail; try {detail=await error.context?.json();} catch {} throw new Error(detail?.error || 'King Credion is unavailable right now.'); }
      return data;
    },
    async requestRefund(purchaseId, reason) { return unwrap(await client.rpc('request_refund', { p_purchase_id: purchaseId, p_reason: reason })); },
    async contestRefundRequest(requestId, response) { return unwrap(await client.rpc('respond_to_refund_request', { p_request_id: requestId, p_accept: false, p_response: response })); },
    async acceptRefundRequest(requestId) {
      await client.rpc('respond_to_refund_request', { p_request_id: requestId, p_accept: true }).then(unwrap);
      const {data,error}=await client.functions.invoke('process-refund',{body:{refund_request_id:requestId}});
      if(error) { let detail; try {detail=await error.context?.json();} catch {} throw new Error(detail?.error || 'The refund could not be processed right now.'); }
      return data;
    },
    async offerPartialRefund(requestId, amountCents, response) { return unwrap(await client.rpc('offer_partial_refund', { p_request_id: requestId, p_amount_cents: amountCents, p_response: response })); },
    async requireReturn(requestId, response) { return unwrap(await client.rpc('require_return', { p_request_id: requestId, p_response: response })); },
    async respondToPartialOffer(requestId, accept) {
      await client.rpc('respond_to_partial_offer', { p_request_id: requestId, p_accept: accept }).then(unwrap);
      if (!accept) return;
      const {data,error}=await client.functions.invoke('process-refund',{body:{refund_request_id:requestId}});
      if(error) { let detail; try {detail=await error.context?.json();} catch {} throw new Error(detail?.error || 'The refund could not be processed right now.'); }
      return data;
    },
    async getReturnLabelRates(refundRequestId) {
      const {data,error}=await client.functions.invoke('refund-return-rates',{body:{refund_request_id:refundRequestId}});
      if(error) { let detail; try {detail=await error.context?.json();} catch {} throw new Error(detail?.error || 'Could not get return shipping rates right now.'); }
      return data.rates;
    },
    async buyReturnLabel(refundRequestId, rateId) {
      const {data,error}=await client.functions.invoke('refund-buy-return-label',{body:{refund_request_id:refundRequestId,rate_id:rateId}});
      if(error) { let detail; try {detail=await error.context?.json();} catch {} throw new Error(detail?.error || 'Could not buy this return label right now.'); }
      return data;
    },
    async operatorOpenDisputeCount() { return unwrap(await client.rpc('operator_open_dispute_count')); },
  };
}
