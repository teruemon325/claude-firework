/* 花火の表示とアニメーション（デモ版）
 *
 * ⚠️ これは【演出】です。
 *    実際の花火の開花直径・明るさ・残光・色・打上の間隔・発数を
 *    再現するものではありません。見え方の正確さは上がりません。
 */

/* ---------------- 状態 ---------------- */
const state = {
  viewer: null,
  site: null,
  ground: 0,
  altitude: 200,
  night: false,
  intervalSec: 1.2,
};

let markerEntities = [];   // 打上地点マーカーと高度の目安（アニメーションとは独立）
let shells = [];           // 進行中の花火
let playing = false;
let tickHandler = null;
let lastMs = 0;
let sinceSpawn = 0;

const PALETTE_NIGHT = ['#ffd34d', '#ff7a59', '#7ee081', '#6ec8ff', '#e28cff', '#fff3b0'];
const PALETTE_DAY = ['#ffb703', '#fb8500', '#8ecae6', '#219ebc', '#ff8fa3', '#ffd166'];

const easeOut = (x) => 1 - (1 - x) * (1 - x);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function isPlaying() { return playing; }

/** アニメーションの設定を更新する（高度・昼夜・間隔など） */
export function configure(opts) { Object.assign(state, opts); }

/* ---------------- 静的な表示（打上地点と高度の目安） ---------------- */

/**
 * 打上地点のマーカーと、高度の目安（点線＋球）を描く。
 * アニメーション中は球を消して、点線とマーカーだけ残す。
 */
export function renderFirework(viewer, site, groundHeight, altitudeAGL, night = false, opts = {}) {
  const showBurst = opts.showBurst !== false;
  state.viewer = viewer;
  state.site = site;
  state.ground = groundHeight ?? 0;
  state.altitude = altitudeAGL;
  state.night = night;

  clearFirework(viewer);
  const base = state.ground;
  const top = base + altitudeAGL;
  const line = night ? '#ffcc33' : '#ff8800';
  const fill = night ? '#fff3b0' : '#ffd166';

  // 高度を示す縦線
  markerEntities.push(viewer.entities.add({
    polyline: {
      positions: Cesium.Cartesian3.fromDegreesArrayHeights([
        site.lon, site.lat, base, site.lon, site.lat, top,
      ]),
      width: 2,
      material: new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.fromCssColorString(line).withAlpha(night ? 0.95 : 0.8),
      }),
    },
  }));

  // 高度の目安の球（アニメーション中は出さない）
  if (showBurst) {
    markerEntities.push(viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(site.lon, site.lat, top),
      ellipsoid: {
        radii: new Cesium.Cartesian3(60, 60, 60),
        material: Cesium.Color.fromCssColorString(fill).withAlpha(night ? 0.75 : 0.45),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString(line).withAlpha(0.95),
      },
      label: {
        text: `花火（イメージ）\n地上高 ${altitudeAGL} m`,
        font: '13px sans-serif',
        fillColor: Cesium.Color.WHITE,
        showBackground: true,
        backgroundColor: Cesium.Color.BLACK.withAlpha(0.6),
        pixelOffset: new Cesium.Cartesian2(0, -46),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    }));
  }

  // 打上地点のマーカー
  markerEntities.push(viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(site.lon, site.lat, base),
    point: {
      pixelSize: 10, color: Cesium.Color.ORANGERED,
      outlineColor: Cesium.Color.WHITE, outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: '打上地点（推定）',
      font: '12px sans-serif', fillColor: Cesium.Color.WHITE,
      showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString('#7f1d1d').withAlpha(0.85),
      pixelOffset: new Cesium.Cartesian2(0, 18),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  }));
  return top;
}

export function clearFirework(viewer) {
  markerEntities.forEach((e) => viewer.entities.remove(e));
  markerEntities = [];
}

/* ---------------- アニメーション ---------------- */

function spawnShell() {
  const { viewer, site } = state;
  if (!viewer || !site) return;

  // 会場の広がりを表すため、打上地点の周囲に少しばらつかせる（デモ用の演出）
  const dLon = rand(-0.0012, 0.0012);
  const dLat = rand(-0.0008, 0.0008);
  const peak = state.altitude * rand(0.78, 1.06);
  const color = Cesium.Color.fromCssColorString(pick(state.night ? PALETTE_NIGHT : PALETTE_DAY));

  const s = {
    lon: site.lon + dLon,
    lat: site.lat + dLat,
    base: state.ground,
    peak,
    t: 0,
    riseDur: rand(1.6, 2.4),
    burstDur: rand(1.4, 2.2),
    radius: rand(45, 110),
    color,
    ents: [],
  };

  const risingHeight = () => s.base + s.peak * easeOut(Math.min(1, s.t / s.riseDur));
  const isRising = () => s.t < s.riseDur;
  const burstP = () => Math.max(0, Math.min(1, (s.t - s.riseDur) / s.burstDur));

  // 上昇中の光
  s.ents.push(viewer.entities.add({
    position: new Cesium.CallbackProperty(
      () => Cesium.Cartesian3.fromDegrees(s.lon, s.lat, risingHeight()), false),
    point: {
      pixelSize: state.night ? 7 : 5,
      color: s.color,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      show: new Cesium.CallbackProperty(() => isRising(), false),
    },
  }));

  // 上昇の軌跡
  s.ents.push(viewer.entities.add({
    polyline: {
      positions: new Cesium.CallbackProperty(() => {
        const h = risingHeight();
        const tailFrom = Math.max(s.base, h - s.peak * 0.22);
        return Cesium.Cartesian3.fromDegreesArrayHeights([
          s.lon, s.lat, tailFrom, s.lon, s.lat, h,
        ]);
      }, false),
      width: 2,
      material: new Cesium.ColorMaterialProperty(
        new Cesium.CallbackProperty(() => s.color.withAlpha(state.night ? 0.75 : 0.5), false)),
      show: new Cesium.CallbackProperty(() => isRising(), false),
    },
  }));

  // 開花
  s.ents.push(viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(s.lon, s.lat, s.base + s.peak),
    ellipsoid: {
      radii: new Cesium.CallbackProperty(() => {
        const r = Math.max(1, s.radius * easeOut(burstP()));
        return new Cesium.Cartesian3(r, r, r);
      }, false),
      material: new Cesium.ColorMaterialProperty(
        new Cesium.CallbackProperty(() => {
          const p = burstP();
          const a = Math.pow(1 - p, 1.6) * (state.night ? 0.85 : 0.5);
          return s.color.withAlpha(Math.max(0, a));
        }, false)),
      outline: false,
      show: new Cesium.CallbackProperty(() => !isRising(), false),
    },
  }));

  shells.push(s);
}

function tick() {
  const now = performance.now();
  const dt = lastMs ? Math.min(0.1, (now - lastMs) / 1000) : 0;
  lastMs = now;

  // 進行と後始末
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i];
    s.t += dt;
    if (s.t > s.riseDur + s.burstDur) {
      s.ents.forEach((e) => state.viewer.entities.remove(e));
      shells.splice(i, 1);
    }
  }

  if (!playing) return;
  sinceSpawn += dt;
  if (sinceSpawn >= state.intervalSec && shells.length < 12) {
    sinceSpawn = 0;
    spawnShell();
    // ときどき同時に複数発
    if (Math.random() < 0.35) spawnShell();
  }
}

function ensureTick() {
  if (tickHandler || !state.viewer) return;
  tickHandler = tick;
  state.viewer.scene.preUpdate.addEventListener(tickHandler);
}

/** 連続再生を開始する */
export function startShow() {
  if (!state.viewer) return;
  ensureTick();
  playing = true;
  lastMs = 0;
  sinceSpawn = state.intervalSec; // すぐ1発目
}

/** 連続再生を止める（進行中の花火は消えるまで残す） */
export function stopShow() {
  playing = false;
  sinceSpawn = 0;
}

/** 1発だけ打ち上げる */
export function launchOnce() {
  if (!state.viewer) return;
  ensureTick();
  if (!lastMs) lastMs = performance.now();
  spawnShell();
}

/** 進行中の花火をすべて消す */
export function clearShells() {
  if (!state.viewer) return;
  shells.forEach((s) => s.ents.forEach((e) => state.viewer.entities.remove(e)));
  shells = [];
}
