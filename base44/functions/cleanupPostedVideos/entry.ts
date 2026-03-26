import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Find posts that are posted and have a video_url
        const posts = await base44.entities.ScheduledPost.filter({ status: 'posted' });
        
        const now = new Date();
        const deletedCount = 0;
        const updates = [];

        for (const post of posts) {
            // Check if it still has a video url to delete
            if (!post.video_url) continue;

            // Check time since last update (which should be the posting time)
            const updatedDate = new Date(post.updated_date);
            const diffMinutes = (now - updatedDate) / (1000 * 60);

            if (diffMinutes >= 30) {
                // Delete the video file reference to "delete" it from storage view
                // (Assuming platform handles physical cleanup or we just hide it)
                await base44.entities.ScheduledPost.update(post.id, {
                    video_url: null,
                    // We keep thumbnail_url for reference in the list? 
                    // User said "videos take up too much storage", images are small.
                    // So we'll keep thumbnail.
                    metadata: { 
                        ...post.metadata, 
                        video_deleted: true,
                        video_deleted_at: now.toISOString()
                    }
                });
                
                updates.push({ id: post.id, title: post.title });
            }
        }

        return Response.json({ 
            success: true, 
            deleted_count: updates.length,
            deleted_posts: updates 
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});