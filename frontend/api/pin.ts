/**
 * POST /api/pin — pins a photo + ERC-721 metadata JSON to IPFS (Pinata) and returns the ipfs:// URI.
 *
 * Why a server route: the Pinata JWT must never reach the browser. The route also re-hashes the photo and
 * rejects it if the sha-256 does not match what the client will submit on-chain, so the CID, the metadata
 * and the on-chain `imageHash` always describe the same bytes.
 *
 * Env: PINATA_JWT (server-side only). If unset the route answers 501 and the app falls back to an
 * on-chain data: URI.
 */
import { createHash } from 'node:crypto';

const PINATA = 'https://api.pinata.cloud';
const MAX_IMAGE_BYTES = 1_500_000;

type Kind = 'plant' | 'verify';

interface PinBody {
  kind: Kind;
  mime: string;
  imageBase64: string;
  imageHash: string; // 0x… sha-256 of the decoded bytes
  meta: { lat: number; lon: number; accuracyM?: number; takenAt: string; treeId?: number; alive?: boolean };
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export async function POST(request: Request): Promise<Response> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) return json({ error: 'ipfs_not_configured' }, 501);

  let body: PinBody;
  try {
    body = (await request.json()) as PinBody;
  } catch {
    return json({ error: 'bad_json' }, 400);
  }

  const { kind, mime, imageBase64, imageHash, meta } = body ?? ({} as PinBody);
  if (kind !== 'plant' && kind !== 'verify') return json({ error: 'bad_kind' }, 400);
  if (mime !== 'image/jpeg') return json({ error: 'jpeg_only' }, 400);
  if (typeof imageBase64 !== 'string' || typeof imageHash !== 'string') return json({ error: 'bad_image' }, 400);
  if (!meta || !isNum(meta.lat) || !isNum(meta.lon) || Math.abs(meta.lat) > 90 || Math.abs(meta.lon) > 180) {
    return json({ error: 'bad_geo' }, 400);
  }
  if (typeof meta.takenAt !== 'string' || Number.isNaN(Date.parse(meta.takenAt))) return json({ error: 'bad_date' }, 400);

  const bytes = Buffer.from(imageBase64, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return json({ error: 'bad_size' }, 413);
  const digest = '0x' + createHash('sha256').update(bytes).digest('hex');
  if (digest !== imageHash.toLowerCase()) return json({ error: 'hash_mismatch' }, 400);

  const tag = `treechain-${kind}-${digest.slice(2, 12)}`;
  const auth = { Authorization: `Bearer ${jwt}` };

  // 1) photo
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'image/jpeg' }), `${tag}.jpg`);
  form.append('pinataMetadata', JSON.stringify({ name: `${tag}.jpg` }));
  const imgRes = await fetch(`${PINATA}/pinning/pinFileToIPFS`, { method: 'POST', headers: auth, body: form });
  if (!imgRes.ok) return json({ error: 'pin_image_failed', status: imgRes.status }, 502);
  const imageCid = ((await imgRes.json()) as { IpfsHash: string }).IpfsHash;
  const imageUri = `ipfs://${imageCid}`;

  // 2) ERC-721 metadata
  const doc = buildMetadata(kind, meta, imageUri, digest);
  const metaRes = await fetch(`${PINATA}/pinning/pinJSONToIPFS`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ pinataContent: doc, pinataMetadata: { name: `${tag}.json` } }),
  });
  if (!metaRes.ok) return json({ error: 'pin_metadata_failed', status: metaRes.status }, 502);
  const metaCid = ((await metaRes.json()) as { IpfsHash: string }).IpfsHash;

  return json({ uri: `ipfs://${metaCid}`, imageUri, metadata: doc });
}

function buildMetadata(kind: Kind, m: PinBody['meta'], imageUri: string, imageHash: string) {
  const planted = kind === 'plant';
  return {
    name: planted ? 'TreeChain Tree' : `TreeChain check${m.treeId ? ` · tree #${m.treeId}` : ''}`,
    description: planted
      ? 'A tree planted and geotagged on TreeChain — a verification chain on Monad. Photo, coordinates and date are pinned to IPFS; the photo hash and coordinates are on-chain.'
      : 'Peer verification evidence for a TreeChain tree.',
    image: imageUri,
    attributes: [
      { trait_type: 'Latitude', value: m.lat },
      { trait_type: 'Longitude', value: m.lon },
      { trait_type: planted ? 'Planted' : 'Checked', display_type: 'date', value: Math.floor(Date.parse(m.takenAt) / 1000) },
      ...(isNum(m.accuracyM) ? [{ trait_type: 'GPS accuracy (m)', value: Math.round(m.accuracyM) }] : []),
    ],
    treechain: {
      version: 1,
      kind,
      lat: m.lat,
      lon: m.lon,
      accuracyM: isNum(m.accuracyM) ? m.accuracyM : null,
      takenAt: m.takenAt,
      imageSha256: imageHash,
      ...(m.treeId ? { treeId: m.treeId } : {}),
      ...(typeof m.alive === 'boolean' ? { stillAlive: m.alive } : {}),
    },
  };
}
