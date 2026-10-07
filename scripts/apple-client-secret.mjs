// Makes the "Secret Key (for OAuth)" that Supabase needs for Sign in with Apple. Run it on your own computer: it reads your Apple key file (.p8) from disk,
// signs a short token with it, and puts the result on your clipboard (it is not printed). The key file and the token never leave your machine.
//
//   node scripts/apple-client-secret.mjs "C:\path\to\AuthKey_L3MUHM7L34.p8"
//
// Apple lets this token live for at most 6 months. This makes one that lasts 150 days, so set a reminder for the date it prints and run this again.
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const APPLE_TEAM_ID = 'SQ8Y93MR22';       // Credabilia LLC
export const APPLE_KEY_ID = 'L3MUHM7L34';        // the "Credabilia Sign in with Apple" key
export const APPLE_SERVICES_ID = 'com.credabilia.web';
export const LIFETIME_SECONDS = 150 * 24 * 3600; // Apple's maximum is 15777000 seconds (about 6 months)

const b64url = value => Buffer.from(value).toString('base64url');

// The signed token Apple expects as the client secret: ES256, signed with the .p8 key, issued by the team for the Services ID.
export function makeAppleClientSecret({ teamId = APPLE_TEAM_ID, keyId = APPLE_KEY_ID, servicesId = APPLE_SERVICES_ID, privateKeyPem, now = Math.floor(Date.now() / 1000), lifetime = LIFETIME_SECONDS }) {
  if (!privateKeyPem || !/BEGIN PRIVATE KEY/.test(privateKeyPem)) throw new Error('That does not look like an Apple .p8 key file.');
  if (lifetime > 15777000) throw new Error('Apple does not allow a secret that lives longer than 6 months.');
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const payload = { iss: teamId, iat: now, exp: now + lifetime, aud: 'https://appleid.apple.com', sub: servicesId };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = sign('sha256', Buffer.from(signingInput), { key: createPrivateKey(privateKeyPem), dsaEncoding: 'ieee-p1363' });
  return { token: `${signingInput}.${b64url(signature)}`, expiresAt: new Date((now + lifetime) * 1000) };
}

function main() {
  const file = process.argv[2], show = process.argv.includes('--print');
  if (!file) { console.error('Usage: node scripts/apple-client-secret.mjs "C:\\path\\to\\AuthKey_XXXXXXXXXX.p8" [--print]'); process.exit(1); }
  let pem;
  try { pem = readFileSync(file, 'utf8'); } catch { console.error('Could not read that file. Check the path.'); process.exit(1); }
  const { token, expiresAt } = makeAppleClientSecret({ privateKeyPem: pem });
  const reminder = new Date(expiresAt.getTime() - 14 * 24 * 3600 * 1000);
  if (show) console.log(token);
  else {
    const copied = process.platform === 'win32' ? spawnSync('clip', { input: token }) : process.platform === 'darwin' ? spawnSync('pbcopy', { input: token }) : { status: 1 };
    if (copied.status !== 0) { console.error('Could not reach the clipboard. Run it again with --print and copy the line yourself.'); process.exit(1); }
    console.log('Copied. Paste it into Supabase > Authentication > Providers > Apple > Secret Key (for OAuth).');
  }
  console.log(`This secret expires on ${expiresAt.toDateString()}. Put a reminder in your calendar for ${reminder.toDateString()} to make a new one.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
