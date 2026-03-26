import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

const REF_IMAGES = [
    "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/e1bb7b419_IMG_0622.png", // King Credion
    "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/46533c917_Photoroom_20251118_202357.png" // Logo
];

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Check if automation is enabled
        const settings = await base44.entities.SystemSetting.filter({ key: 'auto_video_gen_enabled' });
        const isEnabled = settings.length > 0 && settings[0].value === 'true';

        // Allow manual override via force param
        const { force, count = 15, startDate, specificRefImage } = await req.json().catch(() => ({}));
        
        if (!isEnabled && !force) {
            return Response.json({ message: "Automation disabled" });
        }

        // Generate prompts using LLM
        const promptResponse = await base44.integrations.Core.InvokeLLM({
            prompt: `Generate ${count} unique, creative, and distinct video prompts for RunwayML (veo3.1 model) to create 10-second YouTube Shorts ads for 'credabilia.com'.
            
            Subject: King Credion (a green robot mascot with a crown).
            Context: He is explaining the features of the sports memorabilia marketplace 'Credabilia.com'.
            
            Required Elements for EACH prompt:
            1. King Credion must be the central character doing an activity (e.g., examining a card, holding a framed jersey, giving a thumbs up, looking at a hologram).
            2. He must be demonstrating one of these features: User Vetting, Authenticity Votes, Frame Shop Directory, or Influencer Rewards.
            3. The video MUST end with the text "Credabilia.com" appearing clearly on screen.
            
            The tone should be fun, educational, and high-quality 3D animation style.
            Return ONLY a JSON object with a 'prompts' array of strings. Do not add markdown formatting.`,
            response_json_schema: {
                type: "object",
                properties: {
                    prompts: {
                        type: "array",
                        items: { type: "string" }
                    }
                }
            }
        });

        const prompts = promptResponse.prompts;
        if (!prompts || prompts.length === 0) {
            throw new Error("Failed to generate prompts");
        }

        const results = [];
        
        let startTime;
        if (startDate) {
            startTime = new Date(startDate);
        } else {
            startTime = new Date();
            startTime.setDate(startTime.getDate() + 1);
            startTime.setHours(8, 0, 0, 0);
        }

        for (let i = 0; i < prompts.length; i++) {
            const prompt = prompts[i];
            const refImage = specificRefImage || REF_IMAGES[Math.floor(Math.random() * REF_IMAGES.length)];
            
            // Schedule times spread out every 30 minutes
            const scheduledTime = new Date(startTime);
            scheduledTime.setMinutes(scheduledTime.getMinutes() + (i * 30)); 

            try {
                // Call RunwayML
                const { data: task } = await base44.functions.invoke('runway', {
                    action: 'create',
                    model: 'gen3a_turbo',
                    prompt: `${prompt}. High quality, 8k, cinematic lighting.`,
                    ratio: '768:1280', // Supported vertical ratio for Gen-3 Alpha Turbo
                    duration: 10,
                    promptImage: refImage
                });

                // Runway create returns the task object immediately with id
                if (task && task.id) {
                    await base44.entities.ScheduledPost.create({
                        title: "Credabilia.com",
                        description: `${prompt}\n\nVisit credabilia.com! #credabilia #sports #memorabilia`,
                        status: 'generating', 
                        scheduled_date: scheduledTime.toISOString(),
                        platforms: ['youtube'],
                        metadata: {
                            runway_id: task.id,
                            prompt: prompt,
                            ref_image: refImage
                        }
                    });
                    results.push({ prompt, status: 'started', id: task.id });
                }
            } catch (err) {
                console.error(`Failed to start generation for prompt: ${prompt}`, err);
                results.push({ prompt, status: 'failed', error: err.message });
            }
        }

        return Response.json({ success: true, results });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});