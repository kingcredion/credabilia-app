/**
 * Quote Reminder Worker
 * Scheduled function that sends reminders for unpaid quotes
 * 
 * Runs every 10 minutes to check for quotes that need reminders
 * Reminder schedule:
 * - ~10 minutes after creation
 * - ~1 hour after creation
 * - ~24 hours after creation
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const REMINDER_THRESHOLDS = [
  { minutes: 10, label: 'Initial' },
  { minutes: 60, label: '1 hour' },
  { minutes: 1440, label: '24 hours' },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Fetch all pending quotes
    const pendingQuotes = await base44.asServiceRole.entities.Quote.filter(
      { status: 'pending' },
      '-created_date',
      100
    );

    const now = new Date();
    const sentReminders: string[] = [];

    for (const quote of pendingQuotes) {
      // Check expiration
      const expiresAt = new Date(quote.expires_at);
      if (now > expiresAt) continue; // Skip expired quotes

      const createdAt = new Date(quote.created_date);
      const minutesAgo = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60));

      // Check if this quote needs a reminder
      for (const threshold of REMINDER_THRESHOLDS) {
        // Send reminder if created X minutes ago (within 1 minute window to avoid duplicates)
        if (
          minutesAgo >= threshold.minutes &&
          minutesAgo < threshold.minutes + 1
        ) {
          try {
            // Check if reminder was already sent (track in message)
            const reminders = await base44.asServiceRole.entities.Message.filter({
              sender_email: 'system@credabilia.com',
              receiver_email: quote.buyer_email,
              conversation_id: quote.conversation_id,
              message: { $regex: `Quote reminder.*${quote.id}` }
            });

            // Only send if not already sent
            if (reminders.length === 0) {
              const amountDisplay = `$${(quote.amount / 100).toFixed(2)}`;
              const hoursRemaining = Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60));
              
              let reminderMessage = '';
              if (threshold.label === 'Initial') {
                reminderMessage = `⏰ Your quote is still available for ${amountDisplay}\n\nClick "Accept & Pay" before it expires (${hoursRemaining}h left).`;
              } else if (threshold.label === '1 hour') {
                reminderMessage = `⏰ Reminder: Your ${amountDisplay} quote is still waiting\n\nComplete payment in the next ${hoursRemaining}h before it expires.`;
              } else if (threshold.label === '24 hours') {
                reminderMessage = `⏰ Your quote expires soon!\n\nYou have less than 24h to complete payment for your ${quote.service_type?.replace(/_/g, ' ')} quote (${amountDisplay}).`;
              }

              if (reminderMessage) {
                await base44.asServiceRole.entities.Message.create({
                  sender_email: 'system@credabilia.com',
                  sender_name: 'Credabilia',
                  receiver_email: quote.buyer_email,
                  receiver_name: quote.buyer_email.split('@')[0],
                  message: reminderMessage + `\n\n[Quote reminder: ${quote.id}]`,
                  conversation_id: quote.conversation_id,
                });

                sentReminders.push(`${quote.id} (${threshold.label})`);
                console.log(`✅ Sent ${threshold.label} reminder for quote ${quote.id}`);
              }
            }
          } catch (reminderErr) {
            console.error(`❌ Failed to send reminder for quote ${quote.id}:`, reminderErr.message);
          }
        }
      }
    }

    return Response.json({
      success: true,
      processed: pendingQuotes.length,
      reminders_sent: sentReminders.length,
      reminders: sentReminders,
    });

  } catch (error) {
    console.error('❌ quoteReminderWorker error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});