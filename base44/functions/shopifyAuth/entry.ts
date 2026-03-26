import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

const SHOPIFY_API_KEY = Deno.env.get("SHOPIFY_API_KEY");
const SHOPIFY_API_SECRET = Deno.env.get("SHOPIFY_API_SECRET");
// Dynamically determine redirect URI based on host
const getRedirectUri = (host) => `https://${host}/api/functions/shopifyAuth?action=callback`;

Deno.serve(async (req) => {
    try {
        const url = new URL(req.url);
        const base44 = createClientFromRequest(req);
        
        let action, shop, code, state;

        // Handle GET (Callback) vs POST (Frontend Request)
        if (req.method === 'GET') {
            action = url.searchParams.get("action");
            shop = url.searchParams.get("shop");
            code = url.searchParams.get("code");
            state = url.searchParams.get("state");
        } else {
            try {
                const body = await req.json();
                action = body.action;
                shop = body.shop;
            } catch (e) {
                // Ignore json parse error
            }
        }
        
        // Handle step 1: Generate Authorization URL
        if (action === "connect") {
            const user = await base44.auth.me();
            if (!user) {
                return Response.json({ error: 'Unauthorized' }, { status: 401 });
            }

            if (!shop) {
                return Response.json({ error: 'Shop domain is required (e.g., my-store.myshopify.com)' }, { status: 400 });
            }

            // Cleanup shop domain
            let cleanShop = shop.replace(/^https?:\/\//, '').replace(/\/$/, '');
            if (!cleanShop.includes('.')) {
                cleanShop += '.myshopify.com';
            }
            if (!cleanShop.endsWith('myshopify.com')) {
                 // For custom domains, we strictly need the myshopify.com handle for OAuth usually, but let's try.
                 // Shopify docs say "shop" param should be *.myshopify.com
            }

            const scopes = "read_products,read_inventory";
            const redirectUri = getRedirectUri(url.host);
            const state = crypto.randomUUID(); 
            
            const installUrl = `https://${cleanShop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

            return Response.json({ url: installUrl });
        }

        // Handle step 2: OAuth Callback
        if (action === "callback") {
            // Validate required params
            if (!code || !shop) {
                 return new Response("Missing code or shop param", { status: 400 });
            }

            // Exchange code for access token
            const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: SHOPIFY_API_KEY,
                    client_secret: SHOPIFY_API_SECRET,
                    code
                })
            });

            const tokenData = await tokenResponse.json();

            if (!tokenData.access_token) {
                return new Response(`Failed to get access token: ${JSON.stringify(tokenData)}`, { status: 500 });
            }
            
            // Identify user from session
            const user = await base44.auth.me();
            if (!user) {
                 return new Response("Unauthorized - Please log in to the app first and try again.", { status: 401 });
            }

            // Check/Create PlatformConnection
            const existingConnections = await base44.entities.PlatformConnection.filter({
                platform_name: 'shopify',
                account_id: shop
            });
            
            const connectionData = {
                platform_name: 'shopify',
                account_id: shop,
                account_name: shop.replace('.myshopify.com', ''),
                connection_status: 'connected',
                connected_date: new Date().toISOString(),
                settings: {
                    shop_url: shop,
                    access_token: tokenData.access_token,
                    scope: tokenData.scope
                }
            };

            if (existingConnections.length > 0) {
                await base44.entities.PlatformConnection.update(existingConnections[0].id, connectionData);
            } else {
                await base44.entities.PlatformConnection.create(connectionData);
            }

            // Redirect back to the app
            return Response.redirect(`${url.origin}/VendorDashboard?shopify_connected=true`);
        }

        return Response.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});