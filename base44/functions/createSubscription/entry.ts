import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY');

// Price IDs — set STRIPE_PRICE_MONTHLY and STRIPE_PRICE_ANNUAL env vars when ready
const PRICE_IDS = {
  monthly: Deno.env.get('STRIPE_PRICE_MONTHLY'),
  annual:  Deno.env.get('STRIPE_PRICE_ANNUAL'),
};

function stripeRequest(path, method = 'GET', body = null) {
  const headers = {
    'Authorization': `Bearer ${STRIPE_KEY}`,
    'Stripe-Version': '2023-10-16',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  const options = { method, headers };
  if (body) options.body = new URLSearchParams(body).toString();
  return fetch(`https://api.stripe.com/v1${path}`, options).then(r => r.json());
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { planId } = body; // 'monthly' | 'annual'

    if (!planId || !['monthly', 'annual'].includes(planId)) {
      return Response.json({ error: 'Invalid plan' }, { status: 400 });
    }

    if (!PRICE_IDS[planId]) {
      return Response.json({ 
        error: 'Subscription price IDs are not configured yet. Please set STRIPE_PRICE_MONTHLY and STRIPE_PRICE_ANNUAL secrets.' 
      }, { status: 503 });
    }

    const priceId = PRICE_IDS[planId];

    // 1. Ensure Stripe customer exists
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripeRequest('/customers', 'POST', {
        email: user.email,
        name: user.full_name || '',
        'metadata[base44_user_id]': user.id,
      });
      if (customer.error) throw new Error(customer.error.message);
      customerId = customer.id;
      await base44.auth.updateMe({ stripe_customer_id: customerId });
    }

    // 2. Cancel any existing active subscriptions for this customer
    const existingSubs = await stripeRequest(`/subscriptions?customer=${customerId}&status=active&limit=5`);
    if (!existingSubs.error && existingSubs.data) {
      for (const sub of existingSubs.data) {
        await stripeRequest(`/subscriptions/${sub.id}`, 'DELETE', { prorate: 'true' });
      }
    }

    // 3. Create the subscription with default_incomplete so we get a PaymentIntent
    const subParams = {
      customer: customerId,
      'items[0][price]': priceId,
      payment_behavior: 'default_incomplete',
      'expand[0]': 'latest_invoice.payment_intent',
      'metadata[user_id]': user.id,
      'metadata[user_email]': user.email,
      'metadata[plan_id]': planId,
    };

    const subscription = await stripeRequest('/subscriptions', 'POST', subParams);
    if (subscription.error) throw new Error(subscription.error.message);

    const clientSecret = subscription.latest_invoice?.payment_intent?.client_secret;
    if (!clientSecret) throw new Error('Failed to retrieve payment intent client secret');

    console.log('✅ Subscription created:', subscription.id, 'plan:', planId);

    return Response.json({
      subscriptionId: subscription.id,
      clientSecret,
      customerId,
    });

  } catch (error) {
    console.error('❌ createSubscription error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});