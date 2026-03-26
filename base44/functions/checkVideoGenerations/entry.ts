import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // 1. Check for posts that are currently generating
        // Prioritize NEWEST posts first so the user sees progress on their latest batch
        // Limit to 10 to balance throughput and timeout risk
        const generatingPosts = await base44.entities.ScheduledPost.filter({ status: 'generating' }, '-created_date', 10);
        const updates = [];
        const logs = [];

        console.log(`Checking ${generatingPosts.length} generating posts (newest first)...`);

        for (const post of generatingPosts) {
            try {
                // Handle RunwayML Tasks
                if (post.metadata?.runway_id) {
                    console.log(`Checking Runway task ${post.metadata.runway_id} for post ${post.id}`);
                    
                    const { data: task } = await base44.functions.invoke('runway', {
                        action: 'retrieve',
                        id: post.metadata.runway_id
                    });

                    console.log(`Task status: ${task.status}`);

                    if (task.status === 'SUCCEEDED') {
                        console.log(`[${post.id}] Video completed. Initiating secure download...`);

                        // Use a separate try/catch for the download step to log specific errors
                        try {
                            const invokeResult = await base44.functions.invoke('runway', {
                                action: 'download_and_store',
                                id: post.metadata.runway_id
                            });
                            
                            const storeResult = invokeResult.data;
                            console.log(`Store result for ${post.id}:`, JSON.stringify(storeResult));

                            if (storeResult && storeResult.url) {
                                await base44.entities.ScheduledPost.update(post.id, {
                                    status: 'scheduled',
                                    video_url: storeResult.url,
                                    thumbnail_url: task.cover || null
                                });
                                updates.push({ id: post.id, status: 'completed', url: storeResult.url });
                                console.log(`[${post.id}] Successfully updated post with video URL.`);
                            } else {
                                console.error(`[${post.id}] Store result missing URL:`, storeResult);
                                throw new Error("Runway download_and_store returned success but no URL");
                            }
                        } catch (downloadErr) {
                            console.error(`[${post.id}] Download/Store failed:`, downloadErr);
                            logs.push({ id: post.id, error: `Download failed: ${downloadErr.message}` });
                        }
                    } else if (task.status === 'FAILED') {
                        const errorDetail = task.failure || 'Runway task failed';
                        await base44.entities.ScheduledPost.update(post.id, {
                            status: 'failed',
                            metadata: { ...post.metadata, error: errorDetail }
                        });
                        updates.push({ id: post.id, status: 'failed', error: errorDetail });
                    } else {
                         console.log(`[${post.id}] Task still in progress: ${task.status}`);
                    }
                } 
                // Handle Sora Tasks (Legacy)
                else if (post.metadata?.sora_id) {
                     // Legacy logic omitted for brevity
                }
            } catch (postErr) {
                console.error(`Error processing post ${post.id}:`, postErr);
                logs.push({ id: post.id, error: postErr.message });
            }
        }

        return Response.json({ checked_count: generatingPosts.length, updates, logs });
    } catch (error) {
        console.error("Global error in checkVideoGenerations:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});