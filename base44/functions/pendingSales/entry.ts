import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { action, itemId, pendingSaleId, status, note } = await req.json();

        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Action: Create Request (Buyer)
        if (action === 'create_request') {
            const item = await base44.entities.Item.get(itemId);
            if (!item) return Response.json({ error: 'Item not found' }, { status: 404 });

            // Check if request already exists
            const existing = await base44.entities.PendingSale.filter({
                item_id: itemId,
                buyer_email: user.email,
                status: 'pending'
            });

            if (existing.length > 0) {
                 return Response.json({ message: 'Request already pending', pendingSale: existing[0] });
            }

            const pendingSale = await base44.entities.PendingSale.create({
                item_id: item.id,
                vendor_email: item.vendor_email,
                buyer_email: user.email,
                buyer_name: user.full_name || user.email,
                item_title: item.title,
                item_price: item.price,
                status: 'pending'
            });

            // Create notification for vendor
            await base44.entities.Notification.create({
                user_email: item.vendor_email,
                type: 'item_sold', // Reusing type or add 'pending_approval' if enum allows, using generic for now
                title: '📋 Action Required: Sale Pending Approval',
                message: `You have a purchase request for "${item.title}". Please verify availability.`,
                link_url: `/VendorDashboard?tab=pending`,
                related_item_id: item.id
            });

            return Response.json({ success: true, pendingSale });
        }

        // Action: Manage Request (Vendor)
        if (action === 'manage_request') {
            if (!pendingSaleId || !status) return Response.json({ error: 'Missing parameters' }, { status: 400 });

            const pendingSale = await base44.entities.PendingSale.get(pendingSaleId);
            if (!pendingSale) return Response.json({ error: 'Request not found' }, { status: 404 });

            if (pendingSale.vendor_email !== user.email) {
                return Response.json({ error: 'Unauthorized' }, { status: 403 });
            }

            // Update pending sale
            await base44.entities.PendingSale.update(pendingSaleId, {
                status: status,
                vendor_note: note,
                responded_at: new Date().toISOString()
            });

            if (status === 'approved') {
                // Notify Buyer
                await base44.entities.Notification.create({
                    user_email: pendingSale.buyer_email,
                    type: 'new_message',
                    title: '✅ Request Approved!',
                    message: `Good news! The vendor has confirmed "${pendingSale.item_title}" is available. You can now complete your purchase.`,
                    link_url: `/ItemDetails?id=${pendingSale.item_id}&approved=true`,
                    related_item_id: pendingSale.item_id
                });
            } else if (status === 'declined') {
                // Notify Buyer
                await base44.entities.Notification.create({
                    user_email: pendingSale.buyer_email,
                    type: 'new_message',
                    title: '❌ Request Declined',
                    message: `The vendor has declined your request for "${pendingSale.item_title}". Reason: ${note || 'Item unavailable'}`,
                    link_url: `/ItemDetails?id=${pendingSale.item_id}`,
                    related_item_id: pendingSale.item_id
                });

                // Optionally mark item as sold/unavailable if sold elsewhere
                 // If the note implies sold elsewhere, we might want to update the item. 
                 // For now, let's keep it simple and just decline the specific request, 
                 // but the vendor might want to manually update the item status or we can add a flag "mark item as sold" in the payload.
            }

            return Response.json({ success: true });
        }

        return Response.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});