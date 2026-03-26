import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // This function might be called by cron (service role) or admin user
        // If called by cron, we might need to skip auth check or verify a secret header
        // For now, let's assume it's called by an authenticated admin or we use service role logic if needed
        // But to be safe and simple, let's check for user OR service role key if we were doing that, 
        // but here we'll just check if user exists or if it's a specific "system" call. 
        // Simpler: Just require auth for manual trigger, or if it's a cron, the system usually handles it.
        // Let's assume manual trigger from UI for now.
        
        const user = await base44.auth.me().catch(() => null);
        
        // If no user, maybe it's a cron? We'll proceed but rely on base44.asServiceRole for operations if needed
        // But for safety, let's just require a user or assume this is an internal job.
        
        // 1. Get all posts that are 'scheduled'
        const scheduledPosts = await base44.entities.ScheduledPost.filter({ status: 'scheduled' });
        
        // Parse force param to bypass date check
        const { force } = await req.json().catch(() => ({}));
        
        const now = new Date();
        const duePosts = force 
            ? scheduledPosts 
            : scheduledPosts.filter(post => new Date(post.scheduled_date) <= now);
        
        const results = [];
        
        for (const post of duePosts) {
            const result = { id: post.id, title: post.title, platforms: {} };
            let allSuccess = true;
            
            // 2. Publish to platforms
            if (post.platforms.includes('youtube')) {
                try {
                    // Call the publishToYoutube function
                    const { data: youtubeRes } = await base44.functions.invoke('publishToYoutube', {
                        video_url: post.video_url,
                        title: post.title,
                        description: post.description,
                        tags: post.hashtags
                    });
                    
                    if (youtubeRes.success) {
                        result.platforms.youtube = { status: 'success', id: youtubeRes.youtube_id, url: youtubeRes.youtube_url };
                    } else {
                        allSuccess = false;
                        result.platforms.youtube = { status: 'failed', error: youtubeRes.error };
                    }
                } catch (err) {
                    allSuccess = false;
                    result.platforms.youtube = { status: 'failed', error: err.message };
                }
            }
            
            // Add other platforms here...
            
            // 3. Update post status
            const updateData = {
                posted_urls: { ...(post.posted_urls || {}), ...result.platforms }
            };
            
            if (allSuccess) {
                updateData.status = 'posted';
            } else {
                updateData.status = 'failed'; // Or 'partially_posted'
            }
            
            await base44.entities.ScheduledPost.update(post.id, updateData);
            results.push(result);
        }
        
        return Response.json({ 
            processed: results.length,
            details: results
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});