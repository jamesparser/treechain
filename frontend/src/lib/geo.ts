/** Mirrors the on-chain constants (src/Params.sol). The contract is the authority; these power the UI pre-checks. */
export const MIN_TREE_DISTANCE_M = 15;
export const VERIFY_RADIUS_M = 50;
export const MAX_ABS_LAT = 66;

const R = 6_371_008.8; // mean Earth radius, m — same as GeoLib

export const toE6 = (deg: number): number => Math.round(deg * 1e6);
export const fromE6 = (e6: number | bigint): number => Number(e6) / 1e6;

/** Great-circle distance in metres (float haversine — same formula GeoLib evaluates in fixed point). */
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const p1 = lat1 * rad;
  const p2 = lat2 * rad;
  const dp = p2 - p1;
  const dl = (lon2 - lon1) * rad;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function fmtCoord(deg: number): string {
  return deg.toFixed(6);
}
