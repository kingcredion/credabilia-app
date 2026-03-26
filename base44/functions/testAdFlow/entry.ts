import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // 1. Generate Prompt
        const prompt = "A sleek, high-energy commercial for Credabilia.com, the ultimate marketplace for sports memorabilia. Showcasing rare baseball cards, signed jerseys, and authenticated collectibles. Cinematic lighting, professional product shots, dynamic camera movements. Text overlay 'Credabilia.com' appearing in 3D gold letters.";
        
        // 2. Start Runway Generation
        const { data: task } = await base44.functions.invoke('runway', {
            action: 'create',
            model: 'veo3.1',
            prompt: prompt,
            ratio: '768:1280', // Vertical for Shorts
            duration: 10
        });

        if (!task || !task.id) {
            throw new Error("Failed to start Runway generation");
        }

        // 3. Create Scheduled Post
        // Schedule it for "now" so it uploads as soon as generation finishes
        const scheduledTime = new Date(); 
        
        const post = await base44.entities.ScheduledPost.create({
            title: `Test Ad Flow ${new Date().toISOString()}`,
            description: `${prompt}\n\n#credabilia #test`,
            status: 'generating',
            scheduled_date: scheduledTime.toISOString(),
            platforms: ['youtube'],
            metadata: {
                runway_id: task.id,
                prompt: prompt
            }
        });

        return Response.json({ 
            success: true, 
            message: "Video generation started. It will be automatically uploaded to YouTube once complete.",
            video_id: video.id,
            post_id: post.id
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});