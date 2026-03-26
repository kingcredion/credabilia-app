/**
 * Send Quote in DM
 * 
 * Creates a Quote record and attaches it to a message conversation.
 * Ensures vendor is authorized and quote is created with correct expiration.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { buyer_email, conversation_id, amount, description, service_type = 'item_sale', shipping_required = false, address_id = null } = body;

    // Validate inputs
    if (!buyer_email || !conversation_id || !amount || !description) {
      return Response.json({ error: 'Missing required fields: buyer_email, conversation_id, amount, description' }, { status: 400 });
    }

    if (amount <= 0) {
      return Response.json({ error: 'Amount must be greater than 0' }, { status: 400 });
    }

    // Ensure sender is vendor and has REAL Stripe connection for service quotes
    const senderUsers = await base44.asServiceRole.entities.User.filter({ email: user.email });
    const sender = senderUsers[0];
    
    // Check if using simulated Stripe
    const isSimulated = sender?.stripe_account_id?.startsWith('acct_simulated_');
    const hasLiveStripe = sender?.stripe_account_id && 
                          !isSimulated && 
                          sender?.stripe_charges_enabled;
    
    const isVendor = sender?.user_type === 'picture_frame_shop' || 
                     sender?.user_type === 'artist' || 
                     hasLiveStripe;

    // Service quotes (frame shop, artist commission, custom service) require REAL Stripe
    if ((service_type === 'frame_shop' || service_type === 'artist_commission' || service_type === 'custom_service') && !hasLiveStripe) {
      return Response.json({ error: 'Connect a live Stripe account before sending service quotes.' }, { status: 403 });
    }

    if (!isVendor && service_type !== 'item_sale') {
      return Response.json({ error: 'Only vendors can send quotes for services' }, { status: 403 });
    }

    // Validate buyer exists
    const buyers = await base44.asServiceRole.entities.User.filter({ email: buyer_email });
    if (!buyers.length) {
      return Response.json({ error: 'Buyer not found' }, { status: 404 });
    }

    // Create quote with 48-hour expiration
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const quote = await base44.asServiceRole.entities.Quote.create({
      buyer_email,
      buyer_id: buyers[0].id,
      vendor_email: user.email,
      vendor_id: user.id,
      conversation_id,
      amount, // stored as USD cents (e.g., 5000 = $50.00)
      description,
      status: 'pending',
      expires_at: expiresAt,
      service_type,
      shipping_required,
      address_id: shipping_required ? address_id : null,
    });

    // Create message to display quote in conversation
    const message = await base44.asServiceRole.entities.Message.create({
      sender_email: user.email,
      sender_name: user.full_name || user.email,
      receiver_email: buyer_email,
      receiver_name: buyers[0].full_name || buyer_email,
      message: `💰 ${description}`,
      conversation_type: 'offer_negotiation',
      read: false,
    });

    console.log(`✅ Quote ${quote.id} sent: ${user.email} → ${buyer_email} for $${(amount / 100).toFixed(2)}`);

    return Response.json({
      quote_id: quote.id,
      amount,
      description,
      expires_at: expiresAt,
      buyer_email,
      vendor_email: user.email,
      message_id: message.id,
    });

  } catch (error) {
    console.error('❌ sendQuote error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});