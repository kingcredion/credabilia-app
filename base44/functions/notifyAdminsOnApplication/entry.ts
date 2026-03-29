import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Notifies all admin users when a new special account application is submitted.
 * Deduplicates: will not create a second notification if one already exists for the same application.
 *
 * Payload:
 *   applicant_name    - full name of applicant
 *   applicant_email   - email of applicant
 *   account_type      - "artist" | "influencer" | "picture_frame_shop" | "indiegogo_investor"
 *   entity_id         - ID of the created entity (Artist, Influencer, FrameShop, IndiegogoInvestor)
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Authenticate — any logged-in user can trigger this (it runs at signup time)
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { applicant_name, applicant_email, account_type, entity_id } = await req.json();
    if (!applicant_email || !account_type) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const typeLabels = {
      artist: 'Artist',
      influencer: 'Influencer',
      picture_frame_shop: 'Frame Shop',
      indiegogo_investor: 'Founder Circle',
    };

    const approvalPages = {
      artist: 'AdminArtists',
      influencer: 'AdminInfluencers',
      picture_frame_shop: 'AdminFrameShops',
      indiegogo_investor: 'AdminIndiegogoInvestors',
    };

    const typeLabel = typeLabels[account_type] || account_type;
    const approvalPage = approvalPages[account_type] || 'AdminApprovals';
    const displayName = applicant_name || applicant_email;
    const notifTitle = `New ${typeLabel} Application`;
    const notifMessage = `${displayName} submitted a ${typeLabel} application and is awaiting review.`;
    const linkUrl = approvalPage;
    const metadataEntityId = entity_id || null;

    // Fetch all admin users via service role
    const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
    if (!admins || admins.length === 0) {
      return Response.json({ sent: 0, message: 'No admin users found' });
    }

    let sent = 0;
    let skipped = 0;

    await Promise.all(admins.map(async (admin) => {
      // Dedup: check if a notification for this exact entity_id already exists for this admin
      if (metadataEntityId) {
        const existing = await base44.asServiceRole.entities.Notification.filter({
          user_email: admin.email,
          type: 'admin_approval_pending',
        });
        const alreadyNotified = existing.some(
          (n) => n.metadata?.entity_id === metadataEntityId
        );
        if (alreadyNotified) {
          skipped++;
          return;
        }
      }

      await base44.asServiceRole.entities.Notification.create({
        user_email: admin.email,
        type: 'admin_approval_pending',
        title: notifTitle,
        message: notifMessage,
        read: false,
        link_url: linkUrl,
        related_user_email: applicant_email,
        metadata: {
          account_type,
          entity_id: metadataEntityId,
          applicant_email,
          applicant_name: displayName,
        },
      });
      sent++;
    }));

    return Response.json({ sent, skipped });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});