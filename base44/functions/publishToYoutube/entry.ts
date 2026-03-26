import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { google } from 'npm:googleapis@128.0.0';
import { Readable } from 'node:stream';

Deno.serve(async (req) => {
  try {
    // Initialize OAuth2 client inside handler to ensure fresh secrets
    const oauth2Client = new google.auth.OAuth2(
      Deno.env.get("GOOGLE_CLIENT_ID"),
      Deno.env.get("GOOGLE_CLIENT_SECRET"),
      "https://developers.google.com/oauthplayground"
    );

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { video_url, title, description, privacy = 'public' } = payload;

    if (!video_url || !title) {
      return Response.json({ error: 'Missing video_url or title' }, { status: 400 });
    }

    const refresh_token = Deno.env.get("YOUTUBE_REFRESH_TOKEN");

    if (!refresh_token) {
      return Response.json({ error: 'YouTube Refresh Token not configured in secrets' }, { status: 500 });
    }

    // Set credentials
    oauth2Client.setCredentials({
      refresh_token: refresh_token
    });



    const youtube = google.youtube({
      version: 'v3',
      auth: oauth2Client
    });

    // Fetch video stream
    const videoResponse = await fetch(video_url);
    if (!videoResponse.ok) throw new Error("Failed to fetch video file");
    
    const arrayBuffer = await videoResponse.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);
    
    // Create stream manually
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);
    
    // Upload to YouTube
    const res = await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title,
          description,
          tags: payload.tags || [],
        },
        status: {
          privacyStatus: privacy, // 'private', 'public', or 'unlisted'
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: stream,
      },
    });

    return Response.json({ 
      success: true, 
      youtube_id: res.data.id,
      youtube_url: `https://www.youtube.com/watch?v=${res.data.id}`
    });

  } catch (error) {
    console.error("YouTube upload error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});