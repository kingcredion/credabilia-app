import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { imageUrl, maxResults = 5 } = await req.json();

    if (!imageUrl) {
      return Response.json({ error: 'Image URL required' }, { status: 400 });
    }

    // Fetch image from URL
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error('Failed to fetch image');
    }
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));

    // Call Google Vision API with product search
    const visionResponse = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${Deno.env.get('GOOGLE_API_KEY')}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64Image },
              features: [
                { type: 'PRODUCT_SEARCH' },
                { type: 'LABEL_DETECTION' },
                { type: 'OBJECT_LOCALIZATION' }
              ],
              imageContext: {
                productSearchParams: {
                  filter: 'product_category:"homeware"'
                }
              }
            }
          ]
        })
      }
    );

    if (!visionResponse.ok) {
      throw new Error(`Vision API error: ${visionResponse.statusText}`);
    }

    const visionData = await visionResponse.json();

    // Extract product search results
    const productSearchResults = visionData.responses?.[0]?.productSearchResults?.results || [];
    const labels = visionData.responses?.[0]?.labelAnnotations || [];
    const objects = visionData.responses?.[0]?.localizedObjectAnnotations || [];

    // Query your database for similar items using extracted labels
    const labelTexts = labels.slice(0, 5).map(l => l.description.toLowerCase());
    
    const similarItems = await base44.asServiceRole.entities.Item.filter({
      visible_to_public: true,
      status: 'active'
    });

    // Score and rank items by label matches
    const scoredItems = similarItems.map(item => {
      let score = 0;
      const itemTags = (item.tags || []).map(t => t.toLowerCase());
      const itemTitle = (item.title || '').toLowerCase();
      const itemDesc = (item.description || '').toLowerCase();

      labelTexts.forEach(label => {
        if (itemTags.includes(label)) score += 3;
        if (itemTitle.includes(label)) score += 2;
        if (itemDesc.includes(label)) score += 1;
      });

      return { ...item, relevanceScore: score };
    })
    .filter(item => item.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, maxResults);

    return Response.json({
      detectedLabels: labelTexts,
      detectedObjects: objects.slice(0, 3).map(obj => ({
        name: obj.name,
        score: obj.score
      })),
      similarItems: scoredItems,
      productSearchResults: productSearchResults.slice(0, maxResults)
    });
  } catch (error) {
    console.error('Vision API error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});