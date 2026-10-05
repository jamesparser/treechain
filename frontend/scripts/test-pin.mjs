#!/usr/bin/env node
// Unit test for api/pin.ts with a stubbed Pinata: `npm run test:api`
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const dir = mkdtempSync(join(tmpdir(), 'pin-'));
const out = join(dir, 'pin.mjs');
await build({ entryPoints: [new URL('../api/pin.ts', import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
const { POST } = await import(out);

const bytes = Buffer.from('fake-jpeg-bytes-' + Math.random());
const hash = '0x' + createHash('sha256').update(bytes).digest('hex');
const body = (over = {}) => ({
  kind: 'plant',
  mime: 'image/jpeg',
  imageBase64: bytes.toString('base64'),
  imageHash: hash,
  meta: { lat: 11.5622, lon: 104.916, accuracyM: 8, takenAt: '2026-10-05T10:00:00.000Z' },
  ...over,
});
const req = (b) => new Request('http://x/api/pin', { method: 'POST', body: JSON.stringify(b) });

let n = 0;
const ok = (name) => console.log(`  ✓ ${name}`) || n++;

// 1) not configured → 501 (the app then falls back to an on-chain data: URI)
delete process.env.PINATA_JWT;
assert.equal((await POST(req(body()))).status, 501);
ok('501 when PINATA_JWT is unset');

// stub Pinata
const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), auth: init.headers.Authorization, body: init.body });
  if (String(url).endsWith('pinFileToIPFS')) return Response.json({ IpfsHash: 'bafyIMAGE' });
  if (String(url).endsWith('pinJSONToIPFS')) return Response.json({ IpfsHash: 'bafyMETA' });
  return new Response('nope', { status: 500 });
};
process.env.PINATA_JWT = 'test-jwt';

// 2) happy path
const res = await POST(req(body()));
assert.equal(res.status, 200);
const j = await res.json();
assert.equal(j.uri, 'ipfs://bafyMETA');
assert.equal(j.imageUri, 'ipfs://bafyIMAGE');
assert.equal(j.metadata.image, 'ipfs://bafyIMAGE');
assert.equal(j.metadata.treechain.imageSha256, hash);
assert.equal(j.metadata.treechain.lat, 11.5622);
assert.ok(j.metadata.attributes.some((a) => a.trait_type === 'Planted' && a.display_type === 'date'));
ok('pins photo then metadata; metadata links the photo CID and carries geo + date + sha-256');
assert.equal(calls.length, 2);
assert.ok(calls.every((c) => c.auth === 'Bearer test-jwt'));
assert.ok(calls[0].url.endsWith('pinFileToIPFS') && calls[1].url.endsWith('pinJSONToIPFS'));
const pinned = JSON.parse(calls[1].body).pinataContent;
assert.equal(pinned.image, 'ipfs://bafyIMAGE');
ok('JWT is sent server-side only; metadata pinned is what is returned');

// 3) hash mismatch (client hash ≠ bytes) → 400, nothing pinned
calls.length = 0;
const bad = await POST(req(body({ imageHash: '0x' + '00'.repeat(32) })));
assert.equal(bad.status, 400);
assert.equal((await bad.json()).error, 'hash_mismatch');
assert.equal(calls.length, 0);
ok('rejects a photo whose sha-256 differs from the on-chain hash (nothing pinned)');

// 4) validation
for (const [name, over, code] of [
  ['non-jpeg', { mime: 'image/png' }, 'jpeg_only'],
  ['bad kind', { kind: 'steal' }, 'bad_kind'],
  ['bad latitude', { meta: { lat: 120, lon: 0, takenAt: '2026-10-05T10:00:00Z' } }, 'bad_geo'],
  ['bad date', { meta: { lat: 1, lon: 1, takenAt: 'yesterday-ish' } }, 'bad_date'],
]) {
  const r = await POST(req(body(over)));
  assert.equal(r.status, 400, name);
  assert.equal((await r.json()).error, code, name);
}
ok('rejects non-JPEG, unknown kind, out-of-range coordinates, unparseable dates');

const big = Buffer.alloc(1_600_000, 1);
const r = await POST(req(body({ imageBase64: big.toString('base64'), imageHash: '0x' + createHash('sha256').update(big).digest('hex') })));
assert.equal(r.status, 413);
ok('rejects photos over 1.5 MB');

// 5) upstream failure → 502
globalThis.fetch = async () => new Response('x', { status: 500 });
assert.equal((await POST(req(body()))).status, 502);
ok('502 when Pinata fails');

console.log(`\n${n} groups passed`);
