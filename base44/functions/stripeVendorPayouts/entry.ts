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
    if (!user.stripe_account_id) return Response.json({ error: 'No connected Stripe account' }, { status: 400 });

    const body = await req.json();
    const { action } = body;
    const acct = user.stripe_account_id;

    if (action === 'get_balance') {
      const balance = await stripeRequest('/balance', 'GET', null, acct);
      if (balance.error) throw new Error(balance.error.message);
      const available = (balance.available || []).reduce((s, b) => s + b.amount, 0) / 100;
      const pending = (balance.pending || []).reduce((s, b) => s + b.amount, 0) / 100;
      return Response.json({ available, pending });
    }

    if (action === 'list_payouts') {
      const payouts = await stripeRequest('/payouts?limit=20', 'GET', null, acct);
      if (payouts.error) throw new Error(payouts.error.message);
      return Response.json({
        payouts: (payouts.data || []).map(p => ({
          id: p.id, amount: p.amount / 100, currency: p.currency,
          status: p.status, arrival_date: p.arrival_date, created: p.created,
        })),
      });
    }

    if (action === 'get_earnings') {
      const txns = await stripeRequest('/balance_transactions?limit=50&type=payment', 'GET', null, acct);
      if (txns.error) throw new Error(txns.error.message);
      return Response.json({
        transactions: (txns.data || []).map(t => ({
          id: t.id, amount: t.amount / 100, fee: t.fee / 100, net: t.net / 100,
          currency: t.currency, description: t.description, created: t.created, status: t.status,
        })),
      });
    }

    if (action === 'request_payout') {
      const balance = await stripeRequest('/balance', 'GET', null, acct);
      const available = (balance.available || []).reduce((s, b) => s + b.amount, 0);
      if (available <= 0) return Response.json({ error: 'No available balance' }, { status: 400 });

      const amount = body.amount ? Math.round(body.amount * 100) : available;
      const payout = await stripeRequest('/payouts', 'POST', { amount: String(amount), currency: 'usd' }, acct);
      if (payout.error) throw new Error(payout.error.message);
      return Response.json({ id: payout.id, amount: payout.amount / 100, status: payout.status, arrival_date: payout.arrival_date });
    }

    if (action === 'create_account_session') {
      const session = await stripeRequest('/account_sessions', 'POST', {
        account: acct,
        'components[payments][enabled]': 'true',
        'components[payments][features][refund_management]': 'true',
        'components[payouts][enabled]': 'true',
        'components[payouts][features][instant_payouts]': 'true',
        'components[balances][enabled]': 'true',
        'components[account_onboarding][enabled]': 'true',
      });
      if (session.error) throw new Error(session.error.message);
      return Response.json({ client_secret: session.client_secret });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('stripeVendorPayouts error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});