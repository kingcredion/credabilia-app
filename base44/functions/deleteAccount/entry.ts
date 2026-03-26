import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { email } = body;

    // Verify the user is deleting their own account
    if (user.email !== email) {
      return Response.json({ error: 'Cannot delete another user account' }, { status: 403 });
    }

    // Anonymize listings
    const items = await base44.asServiceRole.entities.Item.filter({ vendor_email: email });
    for (const item of items) {
      await base44.asServiceRole.entities.Item.update(item.id, {
        status: 'archived',
        vendor_email: 'deleted@credabilia.com',
        vendor_id: null
      });
    }

    // Anonymize transactions
    const transactions = await base44.asServiceRole.entities.Transaction.filter({ buyer_email: email });
    for (const txn of transactions) {
      await base44.asServiceRole.entities.Transaction.update(txn.id, {
        buyer_email: 'deleted@credabilia.com'
      });
    }

    // Delete favorites
    const favorites = await base44.asServiceRole.entities.Favorite.filter({ user_email: email });
    for (const fav of favorites) {
      await base44.asServiceRole.entities.Favorite.delete(fav.id);
    }

    // Delete follows (outgoing - decrement following users' follower counts)
    const follows = await base44.asServiceRole.entities.Follow.filter({ follower_email: email });
    for (const follow of follows) {
      await base44.asServiceRole.entities.Follow.delete(follow.id);
      // Decrement follower count on the user being followed
      const followedUsers = await base44.asServiceRole.entities.User.filter({ email: follow.following_email });
      if (followedUsers[0]) {
        await base44.asServiceRole.entities.User.update(followedUsers[0].id, {
          followers_count: Math.max(0, (followedUsers[0].followers_count || 0) - 1)
        });
      }
    }

    // Delete incoming follows (others following the deleted user)
    const incomingFollows = await base44.asServiceRole.entities.Follow.filter({ following_email: email });
    for (const follow of incomingFollows) {
      await base44.asServiceRole.entities.Follow.delete(follow.id);
      // Decrement following count on the follower
      const followerUsers = await base44.asServiceRole.entities.User.filter({ email: follow.follower_email });
      if (followerUsers[0]) {
        await base44.asServiceRole.entities.User.update(followerUsers[0].id, {
          following_count: Math.max(0, (followerUsers[0].following_count || 0) - 1)
        });
      }
    }

    console.log(`✅ Account deletion initiated for ${email}`);
    return Response.json({ success: true });

  } catch (error) {
    console.error('deleteAccount error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});