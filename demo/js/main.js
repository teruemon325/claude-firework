/* 盛岡花火3D見え方シミュレーター — デモ版 メイン
 * ⚠️ デモ版です。座標・評価値・混雑予測は概算／仮の値です。 */

import { DEMO_NOTICE, SOURCES, DATA, LAUNCH_SITE, FIREWORK, EYE_HEIGHT,
  TIME_SLOTS, DEFAULT_TIME_SLOT, HUBS, WEIGHTS, CANDIDATES,
  BASEMAPS, DEFAULT_BASEMAP, TERRAIN_SOURCES, DEFAULT_TERRAIN_SOURCE } from './config.js';
import { surfaceDistance, bearing, compass16, elevationAngle, fmtDistance } from './geo.js';
import { rankCandidates } from './scoring.js';
import { FUTURE_WORK } from './congestion.js';
import { loadRegulation, showRegulation, legendItems, bridgeClosure } from './regulation.js';
import { renderFirework, configure as configureFireworks, startShow, stopShow,
  launchOnce, clearShells, isPlaying } from './fireworks.js';

/* ---------- エラー表示 ---------- */
const errBox = document.getElementById('errors');
const errBody = document.getElementById('errBody');
const errs = [];
document.getElementById('errClose').onclick = () => (errBox.style.display = 'none');
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function showError(title, detail, hint) {
  if (errs.some((e) => e.title === title && e.detail === detail)) return; // 同じ内容は繰り返さない
  errs.push({ title, detail, hint });
  errBody.innerHTML = errs.map((e) =>
    `<p><b>${esc(e.title)}</b><br>${esc(e.detail || '')}${e.hint ? `<br><small>${e.hint}</small>` : ''}</p>`).join('');
  errBox.style.display = 'block';
}
window.addEventListener('unhandledrejection', (e) =>
  showError('未処理のエラー', (e.reason && e.reason.message) || String(e.reason)));

if (typeof Cesium === 'undefined') {
  showError('CesiumJS を読み込めませんでした', 'CDN から Cesium.js を取得できていません。',
    'ネットワーク接続を確認し、ローカル HTTP サーバー経由で開いてください。');
  throw new Error('Cesium unavailable');
}

/* ---------- 固定テキスト ---------- */
document.getElementById('yearBadge').textContent =
  `3D都市モデル ${SOURCES.dataYear}年度 / 大会情報 ${SOURCES.eventYear}年`;
document.getElementById('topNote').textContent = DEMO_NOTICE;
let baseLayer = null, baseCredit = '';
function attrHtml() {
  return `${esc(SOURCES.plateau)}　／　地形: ${esc(SOURCES.terrain)}` +
    (baseCredit ? `　／　背景地図: 出典 ${esc(baseCredit)}` : '') +
    `　／　交通規制: ${esc(SOURCES.event)}を基に再作図（概略・${SOURCES.eventYear}年）` +
    `　<a href="${SOURCES.eventUrl}" target="_blank" rel="noopener">公式サイト</a>　／　<b>デモ版・実際の見え方や混雑を保証しません</b>`;
}
function renderAttribution() {
  document.getElementById('attr').innerHTML = attrHtml();
  document.getElementById('modalSources').innerHTML =
    attrHtml() + `<br>確認日: ${SOURCES.checkedAt}　／　打上地点: ${esc(LAUNCH_SITE.basis)}` +
    `<br>将来機能（今回は未実装）: ${FUTURE_WORK.map(esc).join(' / ')}`;
}
renderAttribution();
document.getElementById('agree').onclick = () => (document.getElementById('modal').style.display = 'none');
document.getElementById('openInfo').onclick = () => (document.getElementById('modal').style.display = 'flex');

/* ---------- Viewer ---------- */
const viewer = new Cesium.Viewer('cesiumContainer', {
  baseLayer: false, baseLayerPicker: false, geocoder: false, homeButton: false,
  sceneModePicker: false, navigationHelpButton: false, animation: false,
  timeline: false, fullscreenButton: false, infoBox: false, selectionIndicator: false,
});
viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#cfcfc8');
viewer.scene.globe.depthTestAgainstTerrain = true;

/* ---------- 背景地図（地理院タイル） ---------- */
function setBaseMap(id) {
  const bm = BASEMAPS.find((b) => b.id === id) || BASEMAPS[0];
  if (baseLayer) { viewer.imageryLayers.remove(baseLayer, true); baseLayer = null; }
  baseCredit = bm.credit;
  if (bm.url) {
    try {
      const provider = new Cesium.UrlTemplateImageryProvider({ url: bm.url, maximumLevel: bm.max });
      let reported = false;
      provider.errorEvent?.addEventListener?.((err) => {
        if (reported) return;
        reported = true;
        showError('背景地図のタイルを取得できませんでした', (err && err.message) || String(err),
          '「背景地図」を「なし」にすると、地形の陰影だけで表示できます。');
      });
      baseLayer = viewer.imageryLayers.addImageryProvider(provider);
    } catch (e) {
      showError('背景地図を読み込めませんでした', e.message);
    }
  }
  applyLighting();
  renderAttribution();
}
const bmSel = document.getElementById('basemap');
bmSel.innerHTML = BASEMAPS.map((b) => `<option value="${b.id}">${esc(b.label)}</option>`).join('');
bmSel.value = DEFAULT_BASEMAP;
bmSel.onchange = () => setBaseMap(bmSel.value);

/* ---------- 地盤標高の取得（失敗を握りつぶさない） ---------- */
async function groundHeight(lon, lat) {
  const carto = Cesium.Cartographic.fromDegrees(lon, lat);
  try {
    const [c] = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [carto]);
    if (c && isFinite(c.height) && Math.abs(c.height) > 0.01) return c.height;
  } catch (e) { /* 下のフォールバックへ */ }
  const h = viewer.scene.globe.getHeight(carto);
  if (typeof h === 'number' && isFinite(h) && Math.abs(h) > 0.01) return h;
  return null; // 取得できなかった
}

const tStat = document.getElementById('terrainStatus');
let terrainOk = false;
function setTerrainStatus(html) { tStat.innerHTML = html; }

let layerJson = null;
async function diagnoseTerrain() {
  // layer.json に直接届くかを確認して、原因を切り分ける
  try {
    const res = await fetch(DATA.terrainLayerJson, { cache: 'no-store' });
    if (!res.ok) return `layer.json の取得に失敗（HTTP ${res.status}）`;
    layerJson = await res.json();
    const j = layerJson;
    return `layer.json OK（maxzoom ${j.maxzoom ?? '?'} / ${j.format ?? '?'} / scheme ${j.scheme ?? '?'}` +
      ` / version ${j.version ?? '?'} / tiles ${JSON.stringify(j.tiles ?? '?')}` +
      ` / available ${Array.isArray(j.available) ? j.available.length + '段' : 'なし'}）`;
  } catch (e) {
    return `layer.json を取得できません: ${e.message}（CORS か通信の問題の可能性）`;
  }
}

document.getElementById('btnShowLayerJson').onclick = () => {
  const el = document.getElementById('layerJsonOut');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
  el.textContent = layerJson
    ? JSON.stringify(layerJson, null, 1).slice(0, 4000)
    : 'layer.json をまだ取得できていません。';
};

let lastDiag = '';
const ION_TOKEN_KEY = 'morioka-demo-ion-token';
const getIonToken = () => (localStorage.getItem(ION_TOKEN_KEY) || '').trim();

const srcSel = document.getElementById('terrainSrc');
srcSel.innerHTML = TERRAIN_SOURCES.map((t) => `<option value="${t.id}">${esc(t.label)}</option>`).join('');
const ionBox = document.getElementById('ionBox');
const ionInput = document.getElementById('ionToken');
ionInput.value = getIonToken();
function syncIonBox() { ionBox.style.display = srcSel.value === 'ion' ? 'block' : 'none'; }
srcSel.onchange = async () => { syncIonBox(); await applyTerrain(srcSel.value); };
document.getElementById('btnIonApply').onclick = async () => {
  localStorage.setItem(ION_TOKEN_KEY, ionInput.value.trim());
  errBox.style.display = 'none'; errs.length = 0;
  await applyTerrain('ion');
};
document.getElementById('btnIonClear').onclick = () => {
  localStorage.removeItem(ION_TOKEN_KEY); ionInput.value = '';
  setTerrainStatus('トークンを消去しました。');
};

function attachTerrainError(tp, label) {
  let reported = false;
  tp.errorEvent?.addEventListener?.((err) => {
    if (reported) return;
    reported = true;
    terrainOk = false;
    const msg = (err && (err.message || err.error?.message)) || String(err);
    setTerrainStatus(`<b class="warn">地形タイルの取得に失敗（${esc(label)}）</b><br>${esc(msg)}<br>${esc(lastDiag)}`);
    showError('地形タイルを取得できませんでした', msg,
      '左パネルの「地形」の選択を変えてください。ion 経由にはアクセストークンが必要です。');
  });
}

async function applyTerrain(id) {
  const src = TERRAIN_SOURCES.find((t) => t.id === id) || TERRAIN_SOURCES[0];
  srcSel.value = src.id; syncIonBox();
  terrainOk = false;

  if (src.kind === 'none') {
    viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
    setTerrainStatus('<b class="warn">地形なしで表示中（暫定）</b><br>' +
      '地面は平らに描かれ、建物は本来の高さより浮いて見えます。高低差・目線高さは正しくありません。');
    await placeFirework(true);
    return;
  }

  if (src.kind === 'ion') {
    const token = getIonToken();
    if (!token) {
      viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
      setTerrainStatus('<b class="warn">Cesium ion のトークンが未設定です。</b><br>' +
        '上の入力欄にトークンを貼って「適用」を押してください。いまは地形なしで表示しています。');
      await placeFirework(true);
      return;
    }
    try {
      Cesium.Ion.defaultAccessToken = token;
      const tp = await Cesium.CesiumTerrainProvider.fromIonAssetId(src.assetId);
      attachTerrainError(tp, `Cesium ion（アセット ${src.assetId}）`);
      viewer.terrainProvider = tp;
      terrainOk = true;
      setTerrainStatus(`地形: 読み込み成功（Cesium ion / アセット ${src.assetId}）`);
      await placeFirework();
    } catch (e) {
      viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
      setTerrainStatus(`<b class="warn">Cesium ion から地形を読み込めませんでした</b><br>${esc(e.message)}<br>` +
        'トークンが正しいか、アセットにアクセスできるかを確認してください。');
      showError('Cesium ion から地形を読み込めませんでした', e.message);
      await placeFirework(true);
    }
    return;
  }

  lastDiag = await diagnoseTerrain();
  try {
    const tp = await Cesium.CesiumTerrainProvider.fromUrl(DATA.terrainLayerJson, { requestVertexNormals: true });
    attachTerrainError(tp, '直接配信');
    viewer.terrainProvider = tp;
    terrainOk = true;
    setTerrainStatus(`地形: 読み込み成功（直接配信）<br>${esc(lastDiag)}`);
    await placeFirework();
  } catch (e) {
    viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
    setTerrainStatus(`<b class="warn">地形を読み込めませんでした（直接配信）</b><br>${esc(e.message)}<br>${esc(lastDiag)}`);
    showError('地形を読み込めませんでした', e.message);
    await placeFirework(true);
  }
}

(async () => {
  lastDiag = await diagnoseTerrain();
  await applyTerrain(DEFAULT_TERRAIN_SOURCE);
  setBaseMap(DEFAULT_BASEMAP);
  await loadBuildings('lod1');
  await setupRegulation();
  refreshRanking();
  flyOverview();
})();

/* ---------- 建築物 ---------- */
let tileset = null;
let currentLod = 'lod1';
async function loadBuildings(lod) {
  if (tileset) { viewer.scene.primitives.remove(tileset); tileset = null; }
  currentLod = lod;
  document.getElementById('btnLod1').setAttribute('aria-pressed', String(lod === 'lod1'));
  document.getElementById('btnLod2').setAttribute('aria-pressed', String(lod === 'lod2'));
  const url = lod === 'lod2' ? DATA.buildingsLod2 : DATA.buildingsLod1;
  try {
    tileset = await Cesium.Cesium3DTileset.fromUrl(url);
    tileset.show = document.getElementById('chkBuildings').checked;
    applyNightStyle();
    viewer.scene.primitives.add(tileset);
  } catch (e) {
    showError('建築物モデルを読み込めませんでした', e.message, esc(url));
  }
}
document.getElementById('btnLod1').onclick = () => loadBuildings('lod1');
document.getElementById('btnLod2').onclick = () => loadBuildings('lod2');
document.getElementById('chkBuildings').onchange = (e) => { if (tileset) tileset.show = e.target.checked; };

/* ---------- 交通規制 ---------- */
let regGeoJson = null, regDs = null;
async function setupRegulation() {
  try {
    regGeoJson = await loadRegulation(DATA.regulationGeoJson);
    regDs = await showRegulation(viewer, regGeoJson);
    regDs.show = document.getElementById('chkRegulation').checked;
    renderLegend();
  } catch (e) {
    showError('交通規制データを読み込めませんでした', e.message,
      'demo/data/traffic-regulation-2026.geojson を確認してください。');
  }
}
document.getElementById('chkRegulation').onchange = (e) => { if (regDs) regDs.show = e.target.checked; };

function renderLegend() {
  const items = legendItems(regGeoJson);
  document.getElementById('legendTitle').textContent =
    `交通規制の凡例（${regGeoJson.metadata.eventYear}年・概略）`;
  document.getElementById('legend').innerHTML = items.map((it) => `
    <div style="margin-bottom:7px">
      <div><span class="legend-swatch" style="background:${it.color}"></span><b>${esc(it.name)}</b></div>
      <div class="hint" style="margin-top:1px">${esc(it.kindLabel)}：<b>${esc(it.timeRange)}</b><br>${esc(it.detail)}</div>
    </div>`).join('') +
    `<div class="src">${esc(regGeoJson.metadata.note)}<br>出典: ${esc(regGeoJson.metadata.source)}
      <a href="${regGeoJson.metadata.sourceUrl}" target="_blank" rel="noopener">公式サイト</a>
      ／ 対象年度: <b>${regGeoJson.metadata.eventYear}年</b> ／ 作成日: ${esc(regGeoJson.metadata.createdAt)}</div>`;
  const b = bridgeClosure(regGeoJson);
  document.getElementById('bridgeNote').innerHTML = b
    ? `⚠️ <b>都南大橋は ${esc(b.timeRange)} に全面通行禁止</b>（${esc(b.detail)}）`
    : '';
}

/* ---------- 花火 ---------- */
let launchGround = null;
async function placeFirework(quiet = false) {
  launchGround = await groundHeight(LAUNCH_SITE.lon, LAUNCH_SITE.lat);
  if (launchGround == null) {
    launchGround = 0;
    if (!quiet) {
      showError('打上地点の地盤標高を取得できませんでした',
        '地形データを読み込めていない可能性があります。',
        '左パネルの「地形」の選択を変えてください。');
    }
  }
  drawFirework();
  syncDetail();
}

/** 打上地点のマーカーと高度の目安を描き直す（再生中は目安の球を出さない） */
function drawFirework() {
  renderFirework(viewer, LAUNCH_SITE, launchGround ?? 0, Number(altInput.value), night,
    { showBurst: !isPlaying() });
  configureFireworks({
    viewer, site: LAUNCH_SITE, ground: launchGround ?? 0,
    altitude: Number(altInput.value), night,
    intervalSec: Number(rateInput.value),
  });
}
const altInput = document.getElementById('altitude');
const rateInput = document.getElementById('rate');
altInput.min = FIREWORK.minAlt; altInput.max = FIREWORK.maxAlt; altInput.value = FIREWORK.defaultAlt;
document.getElementById('altLabel').textContent = FIREWORK.defaultAlt;
altInput.oninput = () => {
  document.getElementById('altLabel').textContent = altInput.value;
  drawFirework();
  syncDetail();
};

/* ---------- 花火のアニメーション（演出） ---------- */
const btnPlay = document.getElementById('btnPlay');
rateInput.oninput = () => {
  document.getElementById('rateLabel').textContent = Number(rateInput.value).toFixed(1);
  configureFireworks({ intervalSec: Number(rateInput.value) });
};
function syncPlayButton() { btnPlay.setAttribute('aria-pressed', String(isPlaying())); }
btnPlay.onclick = () => {
  configureFireworks({
    viewer, site: LAUNCH_SITE, ground: launchGround ?? 0,
    altitude: Number(altInput.value), night, intervalSec: Number(rateInput.value),
  });
  startShow();
  syncPlayButton();
  drawFirework(); // 目安の球を消す
};
document.getElementById('btnStopAnim').onclick = () => {
  stopShow();
  clearShells();
  syncPlayButton();
  drawFirework(); // 目安の球を戻す
};
document.getElementById('btnOnce').onclick = () => {
  configureFireworks({
    viewer, site: LAUNCH_SITE, ground: launchGround ?? 0,
    altitude: Number(altInput.value), night, intervalSec: Number(rateInput.value),
  });
  launchOnce();
};

/* ---------- 昼夜 ---------- */
let night = false;
function setNight(isNight) {
  night = isNight;
  document.getElementById('btnNight').setAttribute('aria-pressed', String(isNight));
  document.getElementById('btnDay').setAttribute('aria-pressed', String(!isNight));
  viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(
    isNight ? '2026-08-11T11:00:00Z' : '2026-08-11T03:00:00Z'); // JST 20:00 / 12:00
  viewer.clock.shouldAnimate = false;
  applyLighting();
  applyNightStyle(isNight);
}
function applyLighting() {
  // 昼は陰影を切って地図を読みやすくし、夜は暗く落として花火を見やすくする
  const sc = viewer.scene;
  sc.globe.enableLighting = night;
  sc.skyAtmosphere.show = true;
  if ('brightnessShift' in sc.skyAtmosphere) sc.skyAtmosphere.brightnessShift = night ? -0.75 : 0;
  if ('saturationShift' in sc.skyAtmosphere) sc.skyAtmosphere.saturationShift = night ? -0.4 : 0;
  if (sc.sun) sc.sun.show = !night;
  if (sc.moon) sc.moon.show = night;
  sc.backgroundColor = Cesium.Color.fromCssColorString(night ? '#03060f' : '#8fbcd9');
  sc.globe.baseColor = Cesium.Color.fromCssColorString(night ? '#0f1218' : '#cfcfc8');
  if (baseLayer) {
    baseLayer.brightness = night ? 0.22 : 1.0;
    baseLayer.saturation = night ? 0.35 : 1.0;
    baseLayer.contrast = night ? 1.15 : 1.0;
  }
}
function applyNightStyle(isNight = night) {
  if (tileset) {
    tileset.style = new Cesium.Cesium3DTileStyle({
      color: isNight ? "color('#2a3040')" : "color('#ffffff')",
    });
  }
  // 花火の見た目も昼夜で切り替える
  if (launchGround != null) drawFirework();
}
document.getElementById('btnNight').onclick = () => setNight(true);
document.getElementById('btnDay').onclick = () => setNight(false);
setNight(false);

/* ---------- カメラ ---------- */
let camMode = 'overview';
function setCamButtons() {
  document.getElementById('btnOverview').setAttribute('aria-pressed', String(camMode === 'overview'));
  document.getElementById('btnEye').setAttribute('aria-pressed', String(camMode === 'eye'));
}
function camInfo(html) { document.getElementById('camInfo').innerHTML = html; }

function flyOverview() {
  camMode = 'overview'; setCamButtons();
  const base = (launchGround ?? 0);
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(LAUNCH_SITE.lon, LAUNCH_SITE.lat - 0.020, base + 2200),
    orientation: { heading: Cesium.Math.toRadians(0), pitch: Cesium.Math.toRadians(-35), roll: 0 },
    duration: 1.4,
  });
  camInfo('会場を俯瞰しています。候補地点を選んで「観覧者の目線」を押すと、地上からの見え方に切り替わります。');
}
document.getElementById('btnOverview').onclick = flyOverview;
document.getElementById('btnEye').onclick = () => {
  const r = currentResult();
  if (!r) { camInfo('<b class="warn">先に右側の候補地点を選んでください。</b>'); return; }
  flyToViewpoint(r.candidate);
};

async function flyToViewpoint(cand) {
  const ground = await groundHeight(cand.lon, cand.lat);
  if (ground == null) {
    camInfo('<b class="warn">この地点の地盤標高を取得できませんでした。</b>目線表示は行いません（地下に潜るため）。');
    showError('地盤標高を取得できませんでした',
      `${cand.name} の地盤標高が取得できないため、目線の高さを決められません。`,
      '地形データの読み込みを待ってからもう一度お試しください。');
    return null;
  }
  camMode = 'eye'; setCamButtons();
  const eye = ground + EYE_HEIGHT;
  const d = surfaceDistance(cand.lon, cand.lat, LAUNCH_SITE.lon, LAUNCH_SITE.lat);
  const fireworkAbs = (launchGround ?? 0) + Number(altInput.value);
  const pitch = elevationAngle(d, fireworkAbs - eye);
  const head = bearing(cand.lon, cand.lat, LAUNCH_SITE.lon, LAUNCH_SITE.lat);
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(cand.lon, cand.lat, eye),
    orientation: {
      heading: Cesium.Math.toRadians(head),
      pitch: Cesium.Math.toRadians(Math.max(-5, Math.min(60, pitch))),
      roll: 0,
    },
    duration: 1.6,
  });
  camInfo(`<b>観覧者の目線</b>（地盤 ${ground.toFixed(0)} m ＋ 1.6 m）で、` +
    `${compass16(head)}（${head.toFixed(0)}°）の方向を見ています。<br>` +
    `見上げる角度 約 ${pitch.toFixed(1)}°。マウスのドラッグで自由に見回せます。`);
  return { ground, eye, pitch };
}

/* ---------- 時間帯 ---------- */
const slotSel = document.getElementById('timeSlot');
slotSel.innerHTML = TIME_SLOTS.map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join('');
slotSel.value = DEFAULT_TIME_SLOT;
slotSel.onchange = () => { refreshRanking(); syncDetail(); };
const currentSlot = () => TIME_SLOTS.find((s) => s.id === slotSel.value);

/* ---------- ランキング ---------- */
let results = [], selectedId = null;
const currentResult = () => results.find((r) => r.candidate.id === selectedId) || null;
function syncDetail() {
  const r = currentResult();
  if (r) showDetail(r);
  else document.getElementById('detail').style.display = 'none';
}
function refreshRanking() {
  results = rankCandidates({
    candidates: CANDIDATES, launchSite: LAUNCH_SITE, hubs: HUBS,
    regulationFeatures: regGeoJson ? regGeoJson.features : [],
    slot: currentSlot(), weights: WEIGHTS,
  });
  document.getElementById('rankList').innerHTML = results.map((r) => `
    <div class="card${selectedId === r.candidate.id ? ' sel' : ''}" data-id="${r.candidate.id}">
      <div class="hd">
        <div class="nm"><span class="rank">${r.rank}</span>${esc(r.candidate.name)}</div>
        <div class="sc">${r.total.toFixed(1)}<span style="font-size:10px;color:#666">/100</span></div>
      </div>
      <div class="mt">${esc(r.candidate.kind)} ／ 打上地点まで約 ${fmtDistance(r.distance)}（${r.compass}）</div>
      <div class="mt">混雑予測 <span class="lv ${r.prediction.crowd.level}">${r.prediction.crowd.level}</span>
        ／ 渋滞予測 <span class="lv ${r.prediction.traffic.level}">${r.prediction.traffic.level}</span></div>
    </div>`).join('');
  document.querySelectorAll('#rankList .card').forEach((el) => {
    el.onclick = () => {
      selectedId = el.dataset.id;
      refreshRanking();
      const r = currentResult();
      if (r) { showDetail(r); flyToViewpoint(r.candidate); }
      setCamButtons();
    };
  });
}

function showDetail(r) {
  const c = r.candidate;
  const fireworkAbs = (launchGround ?? 0) + Number(altInput.value);
  const el = document.getElementById('detail');
  el.style.display = 'block';
  el.innerHTML = `
    <span class="cls" id="detailClose" title="閉じる">✕</span>
    <h3>${esc(c.name)}<span style="float:right;color:#0f766e;margin-right:10px">${r.total.toFixed(1)} / 100</span></h3>
    <div class="hint">${esc(c.kind)}／${c.isPublic ? '公共の場所として登録' : '公共性の確認が必要'}
      ・座標はデモ用の概算値</div>

    <h4>評価の内訳と理由</h4>
    ${r.breakdown.map((b) => `
      <div style="margin-bottom:7px">
        <div style="display:flex;justify-content:space-between"><span>${esc(b.label)}</span>
          <span><b>${b.score.toFixed(1)}</b> / ${b.max}</span></div>
        <div class="bar"><i style="width:${(b.score / b.max) * 100}%"></i></div>
        <ul class="tight">${b.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      </div>`).join('')}

    <h4>花火との位置関係</h4>
    <ul class="tight">
      <li>打上地点まで（水平距離）: <b>${fmtDistance(r.distance)}</b></li>
      <li>方角: <b>${r.compass}</b>（真北基準 ${r.bearing.toFixed(0)}°）</li>
      <li>花火の高さ（標高）: 約 ${fireworkAbs.toFixed(0)} m（打上地点の地盤 ${(launchGround ?? 0).toFixed(0)} m ＋ 地上高 ${altInput.value} m）</li>
      <li>見上げる角度の目安: 約 ${elevationAngle(r.distance, fireworkAbs - EYE_HEIGHT).toFixed(1)}°</li>
    </ul>

    <h4>混雑予測 <span class="lv ${r.prediction.crowd.level}">${r.prediction.crowd.level}</span>
      ／ 渋滞予測 <span class="lv ${r.prediction.traffic.level}">${r.prediction.traffic.level}</span></h4>
    <div class="hint warn">リアルタイム情報ではありません。<b>予測</b>です（${esc(currentSlot().label)}）。</div>
    <div style="margin-top:4px"><b>予測の根拠</b></div>
    <ul class="tight">${r.prediction.traffic.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>

    <h4>アクセス</h4>
    <ul class="tight"><li>${esc(c.accessNote)}</li></ul>

    <h4>注意事項</h4>
    <ul class="tight">${c.cautions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    <div class="hint warn">この地点が立ち入り可能かどうかは判定していません。
      私有地・立入禁止区域・河川管理用道路・交通規制区域には立ち入らないでください。</div>

    <div class="src">情報源: ${esc(c.source)}　／　確認日: ${esc(c.checkedAt)}<br>
      評価は参考の目安です。「必ず見える」「安全」「公式の穴場」を意味するものではありません。</div>`;
  document.getElementById('detailClose').onclick = () => {
    selectedId = null; el.style.display = 'none'; refreshRanking();
  };
}

/* 初期状態のボタン表示（すべての宣言が済んだあとで実行する） */
setCamButtons();
syncPlayButton();
