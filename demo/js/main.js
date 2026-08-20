/* 盛岡花火3D見え方シミュレーター — デモ版 メイン
 * ⚠️ デモ版です。座標・評価値・混雑予測は概算／仮の値です。 */

import { DEMO_NOTICE, SOURCES, DATA, LAUNCH_SITE, FIREWORK, EYE_HEIGHT,
  TIME_SLOTS, DEFAULT_TIME_SLOT, HUBS, WEIGHTS, CANDIDATES } from './config.js';
import { surfaceDistance, bearing, compass16, elevationAngle, fmtDistance } from './geo.js';
import { rankCandidates } from './scoring.js';
import { FUTURE_WORK } from './congestion.js';
import { loadRegulation, showRegulation, legendItems, bridgeClosure } from './regulation.js';
import { renderFirework } from './fireworks.js';

/* ---------- エラー表示 ---------- */
const errBox = document.getElementById('errors');
const errBody = document.getElementById('errBody');
const errs = [];
document.getElementById('errClose').onclick = () => (errBox.style.display = 'none');
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function showError(title, detail, hint) {
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
const attrHtml =
  `${esc(SOURCES.plateau)}　／　地形: ${esc(SOURCES.terrain)}　／　交通規制: ${esc(SOURCES.event)}を基に再作図（概略・${SOURCES.eventYear}年）` +
  `　<a href="${SOURCES.eventUrl}" target="_blank" rel="noopener">公式サイト</a>　／　<b>デモ版・実際の見え方や混雑を保証しません</b>`;
document.getElementById('attr').innerHTML = attrHtml;
document.getElementById('modalSources').innerHTML =
  attrHtml + `<br>確認日: ${SOURCES.checkedAt}　／　打上地点: ${esc(LAUNCH_SITE.basis)}` +
  `<br>将来機能（今回は未実装）: ${FUTURE_WORK.map(esc).join(' / ')}`;
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

(async () => {
  try {
    viewer.terrainProvider = await Cesium.CesiumTerrainProvider.fromUrl(
      DATA.terrainLayerJson, { requestVertexNormals: true });
  } catch (e) {
    showError('地形を読み込めませんでした', e.message,
      '地形なしで続行します。高低差・目線高さは正しく表示されません。');
  }
  await loadBuildings('lod1');
  await setupRegulation();
  await placeFirework();
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
let launchGround = 0;
async function placeFirework() {
  try {
    const [c] = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider,
      [Cesium.Cartographic.fromDegrees(LAUNCH_SITE.lon, LAUNCH_SITE.lat)]);
    if (c && isFinite(c.height)) launchGround = c.height;
  } catch { /* 地形なしでも続行 */ }
  renderFirework(viewer, LAUNCH_SITE, launchGround, Number(altInput.value));
}
const altInput = document.getElementById('altitude');
altInput.min = FIREWORK.minAlt; altInput.max = FIREWORK.maxAlt; altInput.value = FIREWORK.defaultAlt;
document.getElementById('altLabel').textContent = FIREWORK.defaultAlt;
altInput.oninput = () => {
  document.getElementById('altLabel').textContent = altInput.value;
  renderFirework(viewer, LAUNCH_SITE, launchGround, Number(altInput.value));
  syncDetail();
};

/* ---------- 昼夜 ---------- */
function setNight(isNight) {
  document.getElementById('btnNight').setAttribute('aria-pressed', String(isNight));
  document.getElementById('btnDay').setAttribute('aria-pressed', String(!isNight));
  viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(
    isNight ? '2026-08-11T11:00:00Z' : '2026-08-11T03:00:00Z'); // JST 20:00 / 12:00
  viewer.clock.shouldAnimate = false;
  viewer.scene.globe.enableLighting = true;
  viewer.scene.skyAtmosphere.show = true;
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString(isNight ? '#20242c' : '#cfcfc8');
  applyNightStyle(isNight);
}
function applyNightStyle(isNight = document.getElementById('btnNight').getAttribute('aria-pressed') === 'true') {
  if (!tileset) return;
  tileset.style = new Cesium.Cesium3DTileStyle({
    color: isNight ? "color('#3a4050')" : "color('#ffffff')",
  });
}
document.getElementById('btnNight').onclick = () => setNight(true);
document.getElementById('btnDay').onclick = () => setNight(false);
setNight(true);

/* ---------- カメラ ---------- */
function flyOverview() {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(LAUNCH_SITE.lon, LAUNCH_SITE.lat - 0.020, 2600),
    orientation: { heading: Cesium.Math.toRadians(0), pitch: Cesium.Math.toRadians(-38), roll: 0 },
    duration: 1.4,
  });
}
document.getElementById('btnOverview').onclick = flyOverview;

async function flyToViewpoint(cand) {
  let ground = 0;
  try {
    const [c] = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider,
      [Cesium.Cartographic.fromDegrees(cand.lon, cand.lat)]);
    if (c && isFinite(c.height)) ground = c.height;
  } catch { /* noop */ }
  const eye = ground + EYE_HEIGHT;
  const d = surfaceDistance(cand.lon, cand.lat, LAUNCH_SITE.lon, LAUNCH_SITE.lat);
  const fireworkAbs = launchGround + Number(altInput.value);
  const pitch = elevationAngle(d, fireworkAbs - eye);
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(cand.lon, cand.lat, eye),
    orientation: {
      heading: Cesium.Math.toRadians(bearing(cand.lon, cand.lat, LAUNCH_SITE.lon, LAUNCH_SITE.lat)),
      pitch: Cesium.Math.toRadians(Math.max(-10, Math.min(45, pitch))),
      roll: 0,
    },
    duration: 1.6,
  });
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
    };
  });
}

function showDetail(r) {
  const c = r.candidate;
  const fireworkAbs = launchGround + Number(altInput.value);
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
      <li>花火の高さ（標高）: 約 ${fireworkAbs.toFixed(0)} m（打上地点の地盤 ${launchGround.toFixed(0)} m ＋ 地上高 ${altInput.value} m）</li>
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
