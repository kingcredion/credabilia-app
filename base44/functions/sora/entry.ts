import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const apiKey = Deno.env.get("OPENAI_API_KEY");
        if (!apiKey) {
            return Response.json({ error: 'OPENAI_API_KEY not set in backend secrets' }, { status: 500 });
        }

        const { action, ...params } = await req.json();
        const baseUrl = "https://api.openai.com/v1/videos";
        const headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        };

        let response;
        let data;

        switch (action) {
            case 'create':
                // Check if async mode is requested to return immediately
                const isAsync = params.async === true;
                // Remove async flag from params before sending to OpenAI
                const { async: _, ...createParams } = params;
                
                response = await fetch(baseUrl, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(createParams)
                });
                
                // If async mode, just return the response immediately (caller handles polling)
                if (isAsync && response.ok) {
                   data = await response.json();
                   return Response.json(data);
                }
                break;
            case 'list':
                response = await fetch(baseUrl, { headers });
                break;
            case 'retrieve':
                response = await fetch(`${baseUrl}/${params.id}`, { headers });
                break;
            case 'delete':
                response = await fetch(`${baseUrl}/${params.id}`, {
                    method: 'DELETE',
                    headers
                });
                if (response.ok) return Response.json({ success: true });
                break;
            case 'remix':
                response = await fetch(`${baseUrl}/${params.id}/remix`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(params.body)
                });
                break;
            case 'download_and_store':
                // Try /content endpoint first
                let downloadResp = await fetch(`${baseUrl}/${params.id}/content`, { 
                    method: 'GET', 
                    headers 
                });
                
                // If not found or not allowed, try /download endpoint
                if (!downloadResp.ok) {
                     downloadResp = await fetch(`${baseUrl}/${params.id}/download`, { 
                        method: 'GET', 
                        headers 
                    });
                }
                
                if (!downloadResp.ok) {
                     // Try getting the metadata again to see if URL appeared
                     const metaResp = await fetch(`${baseUrl}/${params.id}`, { headers });
                     if (metaResp.ok) {
                         const meta = await metaResp.json();
                         if (meta.url || meta.download_url) {
                             // Fetch from the provided URL
                             downloadResp = await fetch(meta.url || meta.download_url);
                         }
                     }
                }

                if (!downloadResp.ok) {
                    throw new Error(`Failed to download video content. Status: ${downloadResp.status}`);
                }

                // Upload to Base44 storage
                const blob = await downloadResp.blob();
                const file = new File([blob], `sora_${params.id}.mp4`, { type: "video/mp4" });
                
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

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI API Error: ${response.status} - ${errorText}`);
        }

        data = await response.json();
        return Response.json(data);

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});