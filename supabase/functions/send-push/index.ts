import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';
import { createHandler } from './handler.js';

async function sendPush(subscription, payload, { vapidPublicKey, vapidPrivateKey, vapidSubject }) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  await webpush.sendNotification(subscription, payload);
}

Deno.serve(createHandler({ createClient, env: (name: string) => Deno.env.get(name), sendPush }));
