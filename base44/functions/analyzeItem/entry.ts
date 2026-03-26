import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Ensure user is admin or the function is called securely
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { item_id } = await req.json();

        if (!item_id) {
             return Response.json({ error: 'Item ID is required' }, { status: 400 });
        }

        const items = await base44.entities.Item.filter({ id: item_id });
        if (items.length === 0) {
            return Response.json({ error: 'Item not found' }, { status: 404 });
        }
        const item = items[0];

        const prompt = `
        Analyze the following item for a memorabilia marketplace.
        
        Title: ${item.title}
        Description: ${item.description}
        Category: ${item.sport || item.media_category?.join(', ') || 'Unknown'}
        
        Task:
        1. Verify if the item's images match its title and description.
        2. Determine if the item is misclassified (e.g., a baseball glove listed under fine art).
        3. Check for any prohibited or inappropriate content.
        4. Recommend a moderation action: "approve" or "reject".
        5. Provide a confidence score (0-100) for your recommendation.
        6. Provide a brief reason for your recommendation.
        
        Output JSON format:
        {
            "match_status": "match" | "mismatch" | "uncertain",
            "category_check": "correct" | "incorrect",
            "flagged_content": boolean,
            "recommendation": "approve" | "reject",
            "confidence_score": number,
            "reason": "string"
        }
        `;

        const response = await base44.integrations.Core.InvokeLLM({
            prompt: prompt,
            file_urls: item.images || [],
            response_json_schema: {
                type: "object",
                properties: {
                    match_status: { type: "string", enum: ["match", "mismatch", "uncertain"] },
                    category_check: { type: "string", enum: ["correct", "incorrect"] },
                    flagged_content: { type: "boolean" },
                    recommendation: { type: "string", enum: ["approve", "reject"] },
                    confidence_score: { type: "number" },
                    reason: { type: "string" }
                },
                required: ["match_status", "recommendation", "reason"]
            }
        });

        // Store the analysis in the item
        await base44.entities.Item.update(item_id, {
            ai_moderation_analysis: JSON.stringify(response)
        });

        return Response.json({ success: true, analysis: response });

    } catch (error) {
        console.error("Error analyzing item:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});