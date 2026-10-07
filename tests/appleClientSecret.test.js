import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { makeAppleClientSecret, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_SERVICES_ID, LIFETIME_SECONDS } from '../scripts/apple-client-secret.mjs';

const decode = part => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
// An Apple .p8 is a PKCS#8 EC (P-256) private key, which is what this makes for the test.
const keypair = () => generateKeyPairSync('ec', { namedCurve: 'P-256' });

test('the Apple client secret is a valid ES256 token for the Credabilia team and web Services ID', () => {
  const { privateKey, publicKey } = keypair();
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const now = 1_800_000_000;
  const { token, expiresAt } = makeAppleClientSecret({ privateKeyPem: pem, now });
  const [header, payload, signature] = token.split('.');
  assert.deepEqual(decode(header), { alg: 'ES256', kid: APPLE_KEY_ID, typ: 'JWT' });
  assert.deepEqual(decode(payload), { iss: APPLE_TEAM_ID, iat: now, exp: now + LIFETIME_SECONDS, aud: 'https://appleid.apple.com', sub: APPLE_SERVICES_ID });
  assert.equal(expiresAt.getTime(), (now + LIFETIME_SECONDS) * 1000);
  // Apple verifies the signature in raw r||s form (64 bytes), not the DER form
  assert.equal(Buffer.from(signature, 'base64url').length, 64);
  assert.ok(verify('sha256', Buffer.from(`${header}.${payload}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')), 'the signature checks out with the key\'s public half');
});

test('it stays inside Apple\'s 6 month limit and refuses anything that is not an Apple key file', () => {
  assert.ok(LIFETIME_SECONDS < 15777000);
  const pem = keypair().privateKey.export({ type: 'pkcs8', format: 'pem' });
  assert.throws(() => makeAppleClientSecret({ privateKeyPem: pem, lifetime: 15777001 }), /6 months/);
  assert.throws(() => makeAppleClientSecret({ privateKeyPem: 'not a key' }), /\.p8/);
  assert.throws(() => makeAppleClientSecret({ privateKeyPem: '' }), /\.p8/);
});
