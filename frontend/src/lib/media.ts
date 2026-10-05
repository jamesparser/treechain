/** Browser-side photo handling: downscale + JPEG-encode, then SHA-256 the exact bytes that get pinned and hashed on-chain. */

export interface Photo {
  blob: Blob;
  url: string; // object URL for preview
  width: number;
  height: number;
  takenAt: string; // ISO timestamp of capture
}

const MAX_SIDE = 1280;

export async function toPhoto(source: Blob): Promise<Photo> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode photo'))), 'image/jpeg', 0.82),
  );
  return { blob, url: URL.createObjectURL(blob), width, height, takenAt: new Date().toISOString() };
}

/** sha-256 of the blob bytes as 0x-prefixed lowercase hex (fits a Solidity bytes32). */
export async function sha256Hex(blob: Blob): Promise<`0x${string}`> {
  if (!globalThis.crypto?.subtle) throw new Error('Secure context required for hashing (use https or localhost)');
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return `0x${hex}`;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}
