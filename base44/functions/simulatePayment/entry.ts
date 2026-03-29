import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { transactionId, shippingDetails } = await req.json();

    if (!transactionId) {
      return Response.json({ error: 'Missing transactionId' }, { status: 400 });
    }

    // Retrieve the transaction
    const transactions = await base44.asServiceRole.entities.Transaction.filter({ id: transactionId });
    if (transactions.length === 0) {
      return Response.json({ error: 'Transaction not found' }, { status: 404 });
    }

    const transaction = transactions[0];

    // Determine new status — mirror the canonical Stripe webhook logic
    const isEscrowFlow = !!(transaction.commission_request_id || transaction.framing_request_id);
    const newStatus = isEscrowFlow ? 'escrow' : 'paid';

    // shipping_status for physical item direct sales → ready_to_ship (canonical)
    const newShippingStatus = (!isEscrowFlow && transaction.item_id) ? 'ready_to_ship' : transaction.shipping_status || 'pending';
    const newShippingAddressStatus = shippingDetails?.address?.line1 ? 'captured' : (transaction.shipping_address_status || 'missing');

    // Update Transaction with status and shipping details
    await base44.asServiceRole.entities.Transaction.update(transactionId, {
        status: newStatus,
        payment_method: 'simulated_stripe',
        stripe_payment_intent_id: `sim_${Math.random().toString(36).substr(2, 9)}`,
        is_simulated: true,
        shipping_status: newShippingStatus,
        shipping_details: shippingDetails || transaction.shipping_details || null,
        shipping_address_status: newShippingAddressStatus,
    });

    // Update Item status
    if (transaction.item_id) {
        const items = await base44.asServiceRole.entities.Item.filter({ id: transaction.item_id });
        if (items.length > 0) {
            const soldItem = items[0];
            await base44.asServiceRole.entities.Item.update(transaction.item_id, {
                status: 'sold',
                buyer_email: transaction.buyer_email
            });

            // Trigger Klaviyo Notifications (reusing logic from webhook)
            try {
                const KLAVIYO_PRIVATE_KEY = Deno.env.get("KLAVIYO_PRIVATE_API_KEY");
                if (KLAVIYO_PRIVATE_KEY) {
                    const notify = async (body) => {
                        await fetch("https://a.klaviyo.com/api/events", {
                            method: 'POST',
                            headers: {
                                'Authorization': `Klaviyo-API-Key ${KLAVIYO_PRIVATE_KEY}`,
                                'Content-Type': 'application/json',
                                'revision': '2024-02-15'
                            },
                            body: JSON.stringify(body)
                        });
                    };

                    // Vendor Notification
                    await notify({
                        data: {
                            type: 'event',
                            attributes: {
                                properties: {
                                    item_title: soldItem.title,
                                    sale_amount: transaction.sale_amount,
                                    buyer_email: transaction.buyer_email
                                },
                                metric: { data: { type: 'metric', attributes: { name: "Item Sold" } } },
                                profile: { data: { type: 'profile', attributes: { email: soldItem.vendor_email } } }
                            }
                        }
                    });

                    // Buyer Notification
                    await notify({
                        data: {
                            type: 'event',
                            attributes: {
                                properties: {
                                    item_title: soldItem.title,
                                    amount_paid: transaction.sale_amount,
                                    vendor_email: soldItem.vendor_email
                                },
                                metric: { data: { type: 'metric', attributes: { name: "Purchase Successful" } } },
                                profile: { data: { type: 'profile', attributes: { email: transaction.buyer_email } } }
                            }
                        }
                    });
                }
            } catch (e) {
                console.error("Klaviyo error in simulation:", e);
            }
        }
    }

    // Update Commission/Framing Request
    if (transaction.commission_request_id) {
        await base44.asServiceRole.entities.CommissionRequest.update(transaction.commission_request_id, {
            status: 'in_progress',
            payment_status: 'escrow_held',
            escrow_transaction_id: transaction.id
        });
    }

    return Response.json({ success: true });

  } catch (error) {
    console.error("Simulation error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});