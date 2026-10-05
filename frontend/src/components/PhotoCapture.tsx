import { useEffect, useRef, useState } from 'react';
import { toPhoto, type Photo } from '../lib/media';

/** Live camera (getUserMedia) with a native-camera / file-picker fallback. */
export function PhotoCapture({ photo, onChange }: { photo: Photo | null; onChange: (p: Photo | null) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const v = videoRef.current;
    if (stream && v) {
      v.srcObject = stream;
      void v.play().catch(() => undefined);
    }
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [stream]);

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);

  async function open() {
    setError(undefined);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API unavailable (needs https).');
      setStream(
        await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
          audio: false,
        }),
      );
    } catch (e) {
      setError(`${e instanceof Error ? e.message : 'Camera blocked'} — use “Take / choose photo” instead.`);
    }
  }

  async function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0);
    const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', 0.92));
    onChange(await toPhoto(blob));
    setStream(null);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      onChange(await toPhoto(f));
    } catch {
      setError('Could not read that image.');
    }
  }

  if (photo) {
    return (
      <div className="photo">
        <img src={photo.url} alt="Captured tree" />
        <div className="row">
          <span className="muted small">
            {photo.width}×{photo.height} · {new Date(photo.takenAt).toLocaleTimeString()}
          </span>
          <button className="btn btn-ghost" onClick={() => onChange(null)}>
            Retake
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="photo">
      {stream ? (
        <>
          <video ref={videoRef} playsInline muted className="video" data-testid="camera-video" />
          <div className="row">
            <button className="btn btn-primary" onClick={snap} data-testid="snap">
              Capture
            </button>
            <button className="btn btn-ghost" onClick={() => setStream(null)}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div className="photo-empty">
          <p className="muted">Photograph the tree — the photo is hashed in your browser (SHA-256) and pinned with its location and date.</p>
          <div className="row">
            <button className="btn btn-primary" onClick={open} data-testid="open-camera">
              Open camera
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()} data-testid="choose-photo">
              Take / choose photo
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} data-testid="photo-input" />
        </div>
      )}
      {error && <p className="error small">{error}</p>}
    </div>
  );
}
