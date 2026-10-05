import { blobToBase64 } from './media';

export interface EvidenceMeta {
  lat: number;
  lon: number;
  accuracyM?: number;
  takenAt: string;
  treeId?: number;
  alive?: boolean;
}

export interface PinResult {
  /** value to store on-chain (tokenURI for plants, evidenceURI for checks) */
  uri: string;
  /** true when the photo + metadata really are on IPFS; false when we fell back to an on-chain data: URI */
  pinned: boolean;
  imageUri?: string;
}

/**
 * Pin photo + metadata to IPFS through the /api/pin Vercel route. If that route is missing or not configured
 * (no PINATA_JWT), fall back to a self-contained data: URI holding the same metadata (photo hash + geo + date,
 * but not the photo bytes) so the whole plant → NFT → $Tree path still works end to end.
 */
export async function pinEvidence(
  kind: 'plant' | 'verify',
  photo: Blob,
  imageHash: `0x${string}`,
  meta: EvidenceMeta,
): Promise<PinResult> {
  try {
    const res = await fetch('/api/pin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, mime: 'image/jpeg', imageBase64: await blobToBase64(photo), imageHash, meta }),
    });
    if (res.ok) {
      const data = (await res.json()) as { uri: string; imageUri: string };
      return { uri: data.uri, imageUri: data.imageUri, pinned: true };
    }
    if (res.status !== 501 && res.status !== 404) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`IPFS pin failed (${(err as { error?: string }).error ?? res.status})`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('IPFS pin failed')) throw e;
    /* network error / no API route (e.g. static preview) → fall through to the fallback */
  }
  return { uri: dataUri(kind, imageHash, meta), pinned: false };
}

function dataUri(kind: 'plant' | 'verify', imageHash: string, m: EvidenceMeta): string {
  const planted = kind === 'plant';
  const doc = {
    name: planted ? 'TreeChain Tree' : `TreeChain check${m.treeId ? ` · tree #${m.treeId}` : ''}`,
    description: 'Geotagged on TreeChain. IPFS pinning was not configured, so only the photo hash is recorded.',
    attributes: [
      { trait_type: 'Latitude', value: m.lat },
      { trait_type: 'Longitude', value: m.lon },
      { trait_type: planted ? 'Planted' : 'Checked', display_type: 'date', value: Math.floor(Date.parse(m.takenAt) / 1000) },
    ],
    treechain: { version: 1, kind, lat: m.lat, lon: m.lon, takenAt: m.takenAt, imageSha256: imageHash, ipfs: false },
  };
  const json = JSON.stringify(doc);
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return `data:application/json;base64,${b64}`;
}
