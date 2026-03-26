import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const key = Deno.env.get("GOOGLE_API_KEY");
    if (!key) {
      return Response.json({ error: 'Google API key not configured' }, { status: 404 });
    }

    return Response.json({ key });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});