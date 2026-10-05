import { useEffect, useState } from 'react';
import { useGeo } from '../hooks';
import { fmtCoord, MAX_ABS_LAT } from '../lib/geo';

export interface Loc {
  lat: number;
  lon: number;
  accuracy?: number;
  manual: boolean;
}

/** Live GPS fix, with a clearly-labelled manual override for desktop demos. */
export function LocationPanel({ onChange }: { onChange: (l: Loc | null) => void }) {
  const [manual, setManual] = useState(false);
  const [mLat, setMLat] = useState('');
  const [mLon, setMLon] = useState('');
  const { fix, status, message } = useGeo(!manual);

  useEffect(() => {
    if (manual) {
      const lat = Number(mLat);
      const lon = Number(mLon);
      const ok = mLat !== '' && mLon !== '' && Number.isFinite(lat) && Number.isFinite(lon);
      onChange(ok ? { lat, lon, manual: true } : null);
    } else {
      onChange(fix ? { lat: fix.lat, lon: fix.lon, accuracy: fix.accuracy, manual: false } : null);
    }
  }, [manual, mLat, mLon, fix, onChange]);

  const weak = !manual && fix && fix.accuracy > 50;
  const polar = (manual && Math.abs(Number(mLat)) > MAX_ABS_LAT) || (!manual && fix && Math.abs(fix.lat) > MAX_ABS_LAT);

  return (
    <div className="loc" data-testid="location-panel">
      {!manual && (
        <>
          {status === 'locating' && <p className="muted">📡 Getting a GPS fix…</p>}
          {status === 'ok' && fix && (
            <p>
              📍 <b data-testid="gps-coords">
                {fmtCoord(fix.lat)}, {fmtCoord(fix.lon)}
              </b>{' '}
              <span className={weak ? 'warn' : 'muted'}>±{Math.round(fix.accuracy)} m</span>
            </p>
          )}
          {(status === 'denied' || status === 'unavailable') && (
            <p className="error small">Location unavailable{message ? `: ${message}` : ''}. Allow location access, or use manual coordinates below.</p>
          )}
          {weak && <p className="warn small">Weak GPS fix. Step into open sky for a better reading.</p>}
        </>
      )}
      {manual && (
        <div className="grid2">
          <label>
            Latitude
            <input inputMode="decimal" placeholder="11.562200" value={mLat} onChange={(e) => setMLat(e.target.value)} data-testid="manual-lat" />
          </label>
          <label>
            Longitude
            <input inputMode="decimal" placeholder="104.916000" value={mLon} onChange={(e) => setMLon(e.target.value)} data-testid="manual-lon" />
          </label>
        </div>
      )}
      {polar && <p className="error small">TreeChain supports latitudes within ±{MAX_ABS_LAT}°.</p>}
      <label className="check small">
        <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} data-testid="manual-toggle" />
        Enter coordinates manually (desktop demo — self-reported, not GPS)
      </label>
    </div>
  );
}
