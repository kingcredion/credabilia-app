import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const imageUrl = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/0b7e67199_officialcredion.png";
        
        // 1. Fetch the original image
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error("Failed to fetch image");
        
        const blob = await response.blob();
        
        // 2. Create a new File with correct type
        const file = new File([blob], "officialcredion_fixed.png", { type: "image/png" });
        
        // 3. Upload to Base44
        const uploadRes = await base44.integrations.Core.UploadFile({
            file: file
        });
        
        if (!uploadRes.file_url) throw new Error("Upload failed");
        
        // 4. Return the new URL
        return Response.json({ 
            old_url: imageUrl,
            new_url: uploadRes.file_url 
        });
        
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});