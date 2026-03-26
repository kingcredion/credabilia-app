import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

const KLAVIYO_API_URL = "https://a.klaviyo.com/api";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Authenticate user for manual triggers, but allow service-level calls if needed internally
    // For now, we'll require a logged-in user to trigger notifications manually
    if (!user) {
        // If it's a webhook or internal system call, you might authenticate differently
        // For this example, we assume authenticated users (vendors/admins) trigger this
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const KLAVIYO_PRIVATE_KEY = Deno.env.get("KLAVIYO_PRIVATE_API_KEY");
    if (!KLAVIYO_PRIVATE_KEY) {
      return Response.json({ error: 'Klaviyo API Key not configured' }, { status: 500 });
    }

    const { action, payload } = await req.json();

    if (action === 'track_event') {
        return await trackEvent(KLAVIYO_PRIVATE_KEY, payload);
    } else if (action === 'create_profile') {
        return await createProfile(KLAVIYO_PRIVATE_KEY, payload);
    } else {
        return Response.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error) {
    console.error("Klaviyo Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function trackEvent(apiKey, { eventName, email, properties }) {
    // Klaviyo Track API (v3)
    // We need to create an event
    // First, ensure profile exists or get profile ID? 
    // V3 allows passing profile data directly in the event creation
    
    const body = {
        data: {
            type: 'event',
            attributes: {
                properties: properties || {},
                metric: {
                    data: {
                        type: 'metric',
                        attributes: {
                            name: eventName
                        }
                    }
                },
                profile: {
                    data: {
                        type: 'profile',
                        attributes: {
                            email: email
                        }
                    }
                }
            }
        }
    };

    const response = await fetch(`${KLAVIYO_API_URL}/events`, {
        method: 'POST',
        headers: {
            'Authorization': `Klaviyo-API-Key ${apiKey}`,
            'Content-Type': 'application/json',
            'revision': '2024-02-15'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Klaviyo API Error: ${errorText}`);
    }

    return Response.json({ success: true });
}

async function createProfile(apiKey, { email, firstName, lastName, phone }) {
    const body = {
        data: {
            type: 'profile',
            attributes: {
                email: email,
                first_name: firstName,
                last_name: lastName,
                phone_number: phone
            }
        }
    };

    const response = await fetch(`${KLAVIYO_API_URL}/profiles`, {
        method: 'POST',
        headers: {
            'Authorization': `Klaviyo-API-Key ${apiKey}`,
            'Content-Type': 'application/json',
            'revision': '2024-02-15'
        },
        body: JSON.stringify(body)
    });
    
    // 409 Conflict means profile exists, which is fine
    if (!response.ok && response.status !== 409) {
         const errorText = await response.text();
         throw new Error(`Klaviyo Profile Error: ${errorText}`);
    }

    return Response.json({ success: true });
}