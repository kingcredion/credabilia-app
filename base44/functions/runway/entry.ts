import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import RunwayML from 'npm:@runwayml/sdk';
import { encodeBase64 } from "jsr:@std/encoding/base64";

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const apiKey = Deno.env.get("RUNWAYML_API_KEY");
        if (!apiKey) {
            return Response.json({ error: 'RUNWAYML_API_KEY not set in backend secrets' }, { status: 500 });
        }

        const client = new RunwayML({ apiKey });
        const { action, ...params } = await req.json();

        let data;

        switch (action) {
            case 'create':
                // Prepare promptImage
                let promptImageURI = params.promptImage;
                
                // If it's a URL, fetch and convert to Base64 to avoid Content-Type issues
                if (promptImageURI && promptImageURI.startsWith('http')) {
                    console.log("Fetching image to convert to Base64...");
                    const imgRes = await fetch(promptImageURI);
                    if (imgRes.ok) {
                        const arrayBuffer = await imgRes.arrayBuffer();
                        const base64String = encodeBase64(arrayBuffer);
                        // Assume PNG for safety, or detect from headers if possible
                        // runway usually accepts data:image/png;base64,...
                        promptImageURI = `data:image/png;base64,${base64String}`;
                    } else {
                        console.error("Failed to fetch promptImage:", imgRes.status);
                    }
                }

                // Defaults to "veo3.1" (Gen-3 Alpha)
                // Gen-3 Alpha expects promptImage as an array of objects
                data = await client.imageToVideo.create({
                    promptText: params.prompt,
                    promptImage: promptImageURI ? [{ uri: promptImageURI, position: "first" }] : undefined,
                    model: params.model || "veo3.1",
                    ratio: params.ratio || "1280:720", // Default landscape, override for shorts
                    duration: params.duration || 5, // 5 or 10
                    seed: params.seed
                });
                return Response.json(data);

            case 'retrieve':
                data = await client.tasks.retrieve(params.id);
                return Response.json(data);

            case 'download_and_store':
                // Get task status to find the URL
                const task = await client.tasks.retrieve(params.id);
                
                if (task.status !== 'SUCCEEDED') {
                     throw new Error(`Task not succeeded. Status: ${task.status}`);
                }
                
                // Runway output usually in task.output[0]
                const videoUrl = task.output?.[0];
                if (!videoUrl) {
                    throw new Error("No output URL found in task");
                }

                // Download content
                const downloadResp = await fetch(videoUrl);
                if (!downloadResp.ok) {
                    throw new Error(`Failed to download video content. Status: ${downloadResp.status}`);
                }

                // Upload to Base44 storage
                const blob = await downloadResp.blob();
                const file = new File([blob], `runway_${params.id}.mp4`, { type: "video/mp4" });
                
                const uploadRes = await base44.integrations.Core.UploadFile({
                    file: file
                });

                if (!uploadRes.file_url) {
                    throw new Error("Failed to upload video to storage");
                }

                return Response.json({ url: uploadRes.file_url });

            default:
                throw new Error(`Unknown action: ${action}`);
        }

    } catch (error) {
        console.error("Runway error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});