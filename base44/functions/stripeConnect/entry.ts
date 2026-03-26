import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY');

function stripeRequest(path, method = 'GET', body = null, stripeAccount = null) {
  const headers = {
    'Authorization': `Bearer ${STRIPE_KEY}`,
    'Stripe-Version': '2023-10-16',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (stripeAccount) headers['Stripe-Account'] = stripeAccount;

  const options = { method, headers };
  if (body) options.body = new URLSearchParams(body).toString();

  return fetch(`https://api.stripe.com/v1${path}`, options).then(r => r.json());
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { action, returnUrl } = await req.json();

    if (action === 'create_account') {
      let accountId = user.stripe_account_id;

      if (!accountId) {
        const account = await stripeRequest('/accounts', 'POST', {
          type: 'express',
          country: 'US',
          email: user.email,
          'capabilities[card_payments][requested]': 'true',
          'capabilities[transfers][requested]': 'true',
          'metadata[base44_user_id]': user.id,
        });
        if (account.error) throw new Error(account.error.message);
        accountId = account.id;
        await base44.auth.updateMe({ stripe_account_id: accountId });
      }

      const link = await stripeRequest('/account_links', 'POST', {
        account: accountId,
        refresh_url: returnUrl + '?stripe_connect=refresh',
        return_url: returnUrl + '?stripe_connect=success',
        type: 'account_onboarding',
      });
      if (link.error) throw new Error(link.error.message);

      return Response.json({ url: link.url });
    }

    if (action === 'get_status') {
      if (!user.stripe_account_id) return Response.json({ connected: false });

      const account = await stripeRequest(`/accounts/${user.stripe_account_id}`);
      
      // If the account doesn't exist in Stripe (e.g. simulated/stale ID), clear it and return not connected
      if (account.error) {
        console.error('Stripe account lookup failed:', account.error.message);
        await base44.auth.updateMe({ stripe_account_id: null, stripe_charges_enabled: false });
        return Response.json({ connected: false, reset: true });
      }

      if (user.stripe_charges_enabled !== account.charges_enabled) {
        await base44.auth.updateMe({ stripe_charges_enabled: account.charges_enabled });
      }

      return Response.json({
        connected: true,
        charges_enabled: account.charges_enabled,
        details_submitted: account.details_submitted,
        payouts_enabled: account.payouts_enabled,
      });
    }

    if (action === 'reset_account') {
      await base44.auth.updateMe({ stripe_account_id: null, stripe_charges_enabled: false });
      return Response.json({ success: true });
    }

    if (action === 'create_login_link') {
      if (!user.stripe_account_id) return Response.json({ error: 'No connected account' }, { status: 400 });
      const link = await stripeRequest(`/accounts/${user.stripe_account_id}/login_links`, 'POST');
      if (link.error) throw new Error(link.error.message);
      return Response.json({ url: link.url });
    }

    if (action === 'create_account_session') {
      if (!user.stripe_account_id) return Response.json({ error: 'No connected account' }, { status: 400 });
      const acct = user.stripe_account_id;
      const session = await stripeRequest('/account_sessions', 'POST', {
        account: acct,
        'components[account_onboarding][enabled]': 'true',
        'components[account_onboarding][features][external_account_collection]': 'true',
        'components[account_management][enabled]': 'true',
        'components[account_management][features][external_account_collection]': 'true',
        'components[payouts][enabled]': 'true',
        'components[payouts][features][instant_payouts]': 'true',
        'components[payouts][features][standard_payouts]': 'true',
        'components[payouts][features][edit_payout_schedule]': 'true',
        'components[payouts][features][external_account_collection]': 'true',
        'components[balances][enabled]': 'true',
      });
      if (session.error) throw new Error(session.error.message);
      return Response.json({ client_secret: session.client_secret });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Stripe Connect error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});