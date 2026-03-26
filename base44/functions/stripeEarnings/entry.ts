import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import Stripe from 'npm:stripe';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), {
  apiVersion: '2023-10-16',
});

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!user.stripe_account_id) {
      return Response.json({ error: 'No connected Stripe account' }, { status: 400 });
    }

    const { action, amount, currency } = await req.json();
    const accountId = user.stripe_account_id;

    if (action === 'get_dashboard_data') {
      const [balance, transactions, payouts] = await Promise.all([
        stripe.balance.retrieve({ stripeAccount: accountId }),
        stripe.balanceTransactions.list({ limit: 20 }, { stripeAccount: accountId }),
        stripe.payouts.list({ limit: 10 }, { stripeAccount: accountId }),
      ]);

      return Response.json({
        balance,
        transactions: transactions.data,
        payouts: payouts.data,
      });
    }

    if (action === 'create_payout') {
      const balance = await stripe.balance.retrieve({ stripeAccount: accountId });
      const available = balance.available[0]?.amount || 0;

      if (available <= 0) {
        return Response.json({ error: 'No available balance to pay out' }, { status: 400 });
      }

      const payout = await stripe.payouts.create(
        {
          amount: available,
          currency: balance.available[0]?.currency || 'usd',
        },
        { stripeAccount: accountId }
      );

      return Response.json({ payout });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Stripe Earnings error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});