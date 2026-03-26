import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY');

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
    const { action } = body;

    // Ensure Stripe customer exists
    const ensureCustomer = async () => {
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
      return customerId;
    };

    // Create a SetupIntent for saving a new payment method (used by AddCardDialog)
    if (action === 'create_setup_intent') {
      const customerId = await ensureCustomer();
      const si = await stripeRequest('/setup_intents', 'POST', {
        customer: customerId,
        'payment_method_types[]': 'card',
        usage: 'off_session',
        'metadata[base44_user_id]': user.id,
      });
      if (si.error) throw new Error(si.error.message);
      return Response.json({ success: true, clientSecret: si.client_secret });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('stripeManagePaymentMethod error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});