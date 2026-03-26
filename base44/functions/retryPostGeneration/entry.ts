import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { postId } = await req.json();

        if (!postId) {
            return Response.json({ error: "Post ID is required" }, { status: 400 });
        }

        const post = await base44.entities.ScheduledPost.get(postId);
        if (!post) {
            return Response.json({ error: "Post not found" }, { status: 404 });
        }

        // Use existing prompt or fallback to description
        const prompt = post.metadata?.prompt || post.description;
        const refImage = post.metadata?.ref_image;

        // Start new generation with Runway
        const { data: task } = await base44.functions.invoke('runway', {
            action: 'create',
            model: 'veo3.1',
            prompt: prompt,
            ratio: '768:1280',
            duration: 10,
            promptImage: refImage
        });

        if (!task || !task.id) {
            throw new Error("Failed to restart generation with Runway");
        }

        // Update post with new generation ID
        await base44.entities.ScheduledPost.update(postId, {
            status: 'generating',
            metadata: {
                ...post.metadata,
                runway_id: task.id,
                sora_id: null,
                retry_count: (post.metadata?.retry_count || 0) + 1,
                error: null 
            }
        });

        return Response.json({ success: true, message: "Generation restarted" });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});