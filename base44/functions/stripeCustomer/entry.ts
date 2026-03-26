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

    if (action === 'get_publishable_key') {
      return Response.json({ publishableKey: Deno.env.get('VITE_STRIPE_PUBLISHABLE_KEY') });
    }

    if (action === 'get_or_create') {
      const customerId = await ensureCustomer();
      return Response.json({ customerId });
    }

    if (action === 'get_payment_methods') {
      if (!user.stripe_customer_id) return Response.json({ payment_methods: [] });
      // Fetch cards + customer default. Include allow_redisplay filter to surface legacy methods.
      const [pms, customer] = await Promise.all([
        stripeRequest(`/payment_methods?customer=${user.stripe_customer_id}&type=card&limit=20`),
        stripeRequest(`/customers/${user.stripe_customer_id}`),
      ]);
      const defaultId = customer.invoice_settings?.default_payment_method;
      return Response.json({
        payment_methods: (pms.data || []).map(pm => ({
          id: pm.id, brand: pm.card?.brand, last4: pm.card?.last4,
          exp_month: pm.card?.exp_month, exp_year: pm.card?.exp_year,
          is_default: pm.id === defaultId,
          allow_redisplay: pm.allow_redisplay || 'unspecified',
        })),
      });
    }

    if (action === 'set_default') {
      const { paymentMethodId } = body;
      if (!user.stripe_customer_id) return Response.json({ error: 'No customer' }, { status: 400 });
      await stripeRequest(`/customers/${user.stripe_customer_id}`, 'POST', {
        'invoice_settings[default_payment_method]': paymentMethodId,
      });
      await base44.auth.updateMe({ default_payment_method: paymentMethodId });
      return Response.json({ success: true });
    }

    if (action === 'detach') {
      const { paymentMethodId } = body;
      await stripeRequest(`/payment_methods/${paymentMethodId}/detach`, 'POST');
      if (user.default_payment_method === paymentMethodId) {
        await base44.auth.updateMe({ default_payment_method: null });
      }
      return Response.json({ success: true });
    }

    // ── CREATE CUSTOMER SESSION ───────────────────────────────────────────────
    // context: 'checkout' (purchase flow) | 'wallet' (settings/wallet management)
    if (action === 'create_customer_session') {
      const customerId = await ensureCustomer();
      const { context = 'checkout' } = body;
      const isWallet = context === 'wallet';

      const csBody = {
        customer: customerId,
        'components[payment_element][enabled]': 'true',
        // Allow previously-saved methods to be redisplayed (supports legacy attached cards)
        'components[payment_element][features][payment_method_redisplay]': 'enabled',
        'components[payment_element][features][payment_method_redisplay_filters][allow_redisplay_values][]': ['always', 'limited', 'unspecified'],
        // Saving new payment methods: always offer in wallet, offer opt-in during checkout
        'components[payment_element][features][payment_method_save]': isWallet ? 'enabled' : 'enabled',
        'components[payment_element][features][payment_method_save_usage]': 'off_session',
        // Removal: only allowed in wallet context to prevent accidental deletion during purchase
        'components[payment_element][features][payment_method_remove]': isWallet ? 'enabled' : 'disabled',
      };

      const cs = await stripeRequest('/customer_sessions', 'POST', csBody);
      if (cs.error) throw new Error(cs.error.message);
      return Response.json({ customerSessionClientSecret: cs.client_secret, customerId });
    }

    if (action === 'create_setup_intent') {
      const customerId = await ensureCustomer();
      const si = await stripeRequest('/setup_intents', 'POST', {
        customer: customerId,
        'payment_method_types[]': 'card',
        usage: 'off_session',
        'metadata[base44_user_id]': user.id,
      });
      if (si.error) throw new Error(si.error.message);
      console.log('SetupIntent created:', si.id, 'secret prefix:', si.client_secret?.substring(0, 20));
      return Response.json({ clientSecret: si.client_secret });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('stripeCustomer error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});