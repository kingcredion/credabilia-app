import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { items, availableImages = [] } = await req.json();

        if (!items || !Array.isArray(items)) {
            return Response.json({ error: 'Invalid items array' }, { status: 400 });
        }

        // Limit batch size to prevent timeouts
        const batchSize = 20;
        const processedItems = [];

        // Process in parallel with concurrency limit
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            
            const promises = batch.map(async (item) => {
                try {
                    // Skip empty items
                    if (!item.title && !item.name && !item.Product) return null;

                    const title = item.title || item.name || item.Product || "";
                    const description = item.description || item.Description || "";
                    
                    // Simple normalization
                    const price = parseFloat(String(item.price || item.Price || "0").replace(/[^0-9.]/g, '')) || 0;
                    
                    // Prepare image list for context (filenames only to save tokens)
                    const imageListString = availableImages.length > 0 
                        ? availableImages.map(img => img.name).join(", ")
                        : "No images provided";

                    // AI Enrichment
                    const prompt = `
                        Analyze this memorabilia item:
                        Title: "${title}"
                        Description: "${description}"

                        Available Image Filenames: [${imageListString}]

                        Return a JSON object with:
                        - sport: (string) baseball, basketball, football, hockey, etc.
                        - team: (string)
                        - signer: (string) if signed
                        - year: (string)
                        - tags: (array of strings) 5-8 relevant tags
                        - short_description: (string) improved 1-sentence description
                        - is_signed: (boolean)
                        - matched_images: (array of strings) exact filenames from the available list that likely belong to this item. Match based on player name, item type, or similarity.
                    `;

                    const aiResponse = await base44.integrations.Core.InvokeLLM({
                        prompt: prompt,
                        response_json_schema: {
                            type: "object",
                            properties: {
                                sport: { type: "string" },
                                team: { type: "string" },
                                signer: { type: "string" },
                                year: { type: "string" },
                                tags: { type: "array", items: { type: "string" } },
                                short_description: { type: "string" },
                                is_signed: { type: "boolean" },
                                matched_images: { type: "array", items: { type: "string" } }
                            }
                        }
                    });

                    // Map matched filenames back to full image objects
                    const itemImages = [];
                    if (aiResponse.matched_images && Array.isArray(aiResponse.matched_images)) {
                        aiResponse.matched_images.forEach(filename => {
                            const foundImg = availableImages.find(img => img.name === filename);
                            if (foundImg) itemImages.push(foundImg.url);
                        });
                    }

                    return {
                        ...item,
                        id: crypto.randomUUID(), // Temporary ID for frontend keying
                        title, 
                        price, 
                        description: aiResponse.short_description || description,
                        sport: aiResponse.sport || "other",
                        team: aiResponse.team || "",
                        signer: aiResponse.signer || "",
                        year: aiResponse.year || "",
                        tags: aiResponse.tags || [],
                        is_signed: aiResponse.is_signed,
                        images: itemImages.length > 0 ? itemImages : (item.images || []),
                        status: "draft", 
                        vendor_id: user.id,
                        vendor_email: user.email,
                        authenticity_meter: aiResponse.is_signed ? 50 : 80
                    };

                } catch (err) {
                    console.error("Error enriching item:", title, err);
                    return { ...item, error: "AI enrichment failed" };
                }
            });

            const results = await Promise.all(promises);
            processedItems.push(...results.filter(r => r !== null));
        }

        return Response.json({ processedItems });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});