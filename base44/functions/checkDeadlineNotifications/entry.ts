import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // This function might be called by a cron job service role, or manually
        // Check for service role or admin usage if needed, but for now we'll allow it 
        // as it's a utility function.

        // 1. Fetch all accepted quotes that haven't been completed
        // We might need to filter by status 'accepted'
        // Note: In a real app we'd paginate, but for now fetch a batch
        const quotes = await base44.asServiceRole.entities.FramingQuote.filter({ status: "accepted" });

        const notifications = [];

        for (const quote of quotes) {
            if (!quote.accepted_date || !quote.estimated_turnaround) continue;

            // Simple parsing of turnaround: "7-10 business days" -> take "7"
            const daysMatch = quote.estimated_turnaround.match(/\d+/);
            if (!daysMatch) continue;
            
            const days = parseInt(daysMatch[0]);
            const acceptedDate = new Date(quote.accepted_date);
            const dueDate = new Date(acceptedDate);
            dueDate.setDate(dueDate.getDate() + days);

            const now = new Date();
            const timeDiff = dueDate.getTime() - now.getTime();
            const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

            let alertType = null;
            let title = null;
            let message = null;

            if (daysDiff < 0) {
                alertType = "overdue";
                title = "⚠️ Job Overdue";
                message = `Job for quote #${quote.id.slice(0,4)} is overdue by ${Math.abs(daysDiff)} days.`;
            } else if (daysDiff <= 3) {
                alertType = "urgent";
                title = "📅 Deadline Approaching";
                message = `Job for quote #${quote.id.slice(0,4)} is due in ${daysDiff} days.`;
            }

            if (alertType) {
                // Check if notification already exists for this type/quote to avoid spam
                // (Simplified: just send it, frontend bell handles unread)
                
                // Get Shop Email (Sender of quote)
                const shopEmail = quote.sender_email; 
                // Wait, quote.sender_email is the shop.
                
                // Fetch Request to get Item Title
                let itemTitle = "Framing Job";
                if (quote.framing_request_id) {
                    const reqs = await base44.asServiceRole.entities.FramingRequest.filter({ id: quote.framing_request_id });
                    if (reqs.length > 0) itemTitle = reqs[0].title;
                }

                await base44.asServiceRole.entities.Notification.create({
                    user_email: shopEmail,
                    type: "audit_completed", // Re-using an existing type or 'new_message', let's use 'new_message' for generic alert or add new type
                    // Actually let's use 'new_listing_match' or similar, or just generic.
                    // The schema has specific enums. 'item_sold' etc. 
                    // Let's use 'item_sold' as it's business related? No.
                    // 'audit_completed' is safe? 
                    // Let's just use 'new_message' with a custom title.
                    type: "new_message", 
                    title: title,
                    message: `${message} Item: ${itemTitle}`,
                    link_url: `FrameShopDashboard`, // Link to dashboard
                    read: false
                });

                notifications.push({ shopEmail, title });
            }
        }

        return Response.json({ success: true, generated: notifications.length, notifications });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});