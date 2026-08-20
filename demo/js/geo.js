/* 測地計算（Cesium に依存しない純関数。テスト・node からも使える） */

const R = 6378137;            // WGS84 長半径
const F = 1 / 298.257223563;  // 扁平率
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

/** 2 点間の地表距離（m）。Vincenty の逆解法（収束しない場合は大円距離） */
export function surfaceDistance(lon1, lat1, lon2, lat2) {
  const b = R * (1 - F);
  const L = toRad(lon2 - lon1);
  const U1 = Math.atan((1 - F) * Math.tan(toRad(lat1)));
  const U2 = Math.atan((1 - F) * Math.tan(toRad(lat2)));
  const sU1 = Math.sin(U1), cU1 = Math.cos(U1);
  const sU2 = Math.sin(U2), cU2 = Math.cos(U2);
  let lambda = L, prev, it = 0, sS, cS, sigma, sA, c2sm, C;
  do {
    const sL = Math.sin(lambda), cL = Math.cos(lambda);
    sS = Math.sqrt((cU2 * sL) ** 2 + (cU1 * sU2 - sU1 * cU2 * cL) ** 2);
    if (sS === 0) return 0;
    cS = sU1 * sU2 + cU1 * cU2 * cL;
    sigma = Math.atan2(sS, cS);
    sA = (cU1 * cU2 * sL) / sS;
    const c2A = 1 - sA * sA;
    c2sm = c2A === 0 ? 0 : cS - (2 * sU1 * sU2) / c2A;
    C = (F / 16) * c2A * (4 + F * (4 - 3 * c2A));
    prev = lambda;
    lambda = L + (1 - C) * F * sA * (sigma + C * sS * (c2sm + C * cS * (-1 + 2 * c2sm * c2sm)));
  } while (Math.abs(lambda - prev) > 1e-12 && ++it < 200);
  if (it >= 200) return haversine(lon1, lat1, lon2, lat2);
  const u2 = (1 - sA * sA) * ((R * R - b * b) / (b * b));
  const A = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
  const B = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
  const dS = B * sS * (c2sm + (B / 4) * (cS * (-1 + 2 * c2sm * c2sm)
    - (B / 6) * c2sm * (-3 + 4 * sS * sS) * (-3 + 4 * c2sm * c2sm)));
  return b * A * (sigma - dS);
}

export function haversine(lon1, lat1, lon2, lat2) {
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** 真北基準の方位角（度, 0〜360） */
export function bearing(lon1, lat1, lon2, lat2) {
  const φ1 = toRad(lat1), φ2 = toRad(lat2), Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const DIRS16 = ['北','北北東','北東','東北東','東','東南東','南東','南南東',
  '南','南南西','南西','西南西','西','西北西','北西','北北西'];
/** 方位角（度・真北基準）→ 16 方位 */
export function compass16(deg) {
  return DIRS16[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}

/** 仰角（度）。水平距離と高低差から */
export function elevationAngle(horizontalDistance, heightDiff) {
  if (horizontalDistance <= 0) return 90;
  return toDeg(Math.atan2(heightDiff, horizontalDistance));
}

/** 点と線分の最短距離（m）。緯度経度を局所平面に近似 */
function pointSegmentDistance(plon, plat, alon, alat, blon, blat) {
  const mLat = (plat + alat + blat) / 3;
  const kx = 111320 * Math.cos(toRad(mLat));
  const ky = 110574;
  const px = plon * kx, py = plat * ky;
  const ax = alon * kx, ay = alat * ky;
  const bx = blon * kx, by = blat * ky;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** 点から GeoJSON の LineString 群への最短距離（m）と、最も近い地物 */
export function distanceToLineFeatures(lon, lat, features) {
  let best = { distance: Infinity, feature: null };
  for (const f of features) {
    const g = f.geometry;
    if (!g) continue;
    const lines = g.type === 'LineString' ? [g.coordinates]
      : g.type === 'MultiLineString' ? g.coordinates : [];
    for (const line of lines) {
      for (let i = 0; i < line.length - 1; i++) {
        const d = pointSegmentDistance(lon, lat, line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]);
        if (d < best.distance) best = { distance: d, feature: f };
      }
    }
  }
  return best;
}

export const fmtDistance = (m) =>
  m == null ? '—' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`;
