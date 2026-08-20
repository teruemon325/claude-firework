/* 候補地点の評価（デモ版）
 *
 * ⚠️ この評価は「参考のための目安」です。
 *    「必ず見える」「安全」「公式の穴場」といった意味は一切ありません。
 *    樹木・電線・看板・仮設物・当日の人や車・煙・天候は評価に入っていません。
 */
import { surfaceDistance, bearing, compass16, fmtDistance } from './geo.js';
import { predict, LEVELS } from './congestion.js';

const OBSTRUCTION_FACTOR = { low: 1.0, medium: 0.75, high: 0.45 };
const OBSTRUCTION_LABEL = {
  low: '周囲に高い建物が少ない想定',
  medium: '周囲に建物がある程度ある想定',
  high: '周囲に建物が多い想定',
};

/** 見えやすさ（配点 40）：距離帯 × 遮蔽の想定 × 高低差の想定 */
function scoreVisibility(d, cand, max) {
  let df, dWhy;
  if (d < 300)       { df = 0.50; dWhy = '打上地点に非常に近く、見上げる角度が急になります'; }
  else if (d < 800)  { df = 0.85; dWhy = '打上地点に近く、大きく見えます'; }
  else if (d < 2500) { df = 1.00; dWhy = '全体を見渡しやすい距離帯です'; }
  else if (d < 4000) { df = 0.85; dWhy = 'やや離れており、小さく見えます'; }
  else if (d < 6000) { df = 0.60; dWhy = '距離があり、低い高度の花火は見えにくくなります'; }
  else               { df = 0.35; dWhy = '会場から大きく離れています'; }

  const of_ = OBSTRUCTION_FACTOR[cand.obstruction] ?? 0.7;
  const eb = 1 + Math.min(2, cand.elevationAdvantage || 0) * 0.05;
  const score = Math.min(max, max * df * of_ * eb);
  const reasons = [
    `${dWhy}（打上地点まで約 ${fmtDistance(d)}）`,
    `${OBSTRUCTION_LABEL[cand.obstruction] ?? '遮蔽の想定は未設定'}`,
  ];
  if (cand.elevationAdvantage > 0) reasons.push('周囲よりやや高い場所という想定で加点しています');
  return { score, reasons };
}

/** 距離（配点 20）：近すぎず遠すぎない帯を高く */
function scoreDistance(d, max) {
  let r, why;
  if (d >= 800 && d <= 2500)      { r = 1.00; why = '観覧に向く距離帯（およそ 800m〜2.5km）に入っています'; }
  else if (d >= 500 && d < 800)   { r = 0.80; why = 'やや近い距離です'; }
  else if (d > 2500 && d <= 3500) { r = 0.80; why = 'やや遠い距離です'; }
  else if (d >= 300 && d < 500)   { r = 0.55; why = 'かなり近く、視界に入りきらない可能性があります'; }
  else if (d > 3500 && d <= 5000) { r = 0.55; why = '距離があります'; }
  else if (d > 5000 && d <= 7000) { r = 0.30; why = 'かなり遠く、小さく見えます'; }
  else if (d < 300)               { r = 0.30; why = '打上地点に近すぎます'; }
  else                            { r = 0.10; why = '会場から大きく離れています'; }
  return { score: max * r, reasons: [`${why}（約 ${fmtDistance(d)}）`] };
}

/** 交通規制の影響（配点 15）：規制区間から離れているほど高い */
function scoreRegulation(regDistance, max) {
  if (regDistance == null || !isFinite(regDistance)) {
    return { score: max * 0.5, reasons: ['交通規制データを評価できていません'] };
  }
  let r, why;
  if (regDistance < 150)       { r = 0.20; why = '交通規制区間のすぐそばです。車での接近はできません'; }
  else if (regDistance < 400)  { r = 0.50; why = '交通規制区間に近く、迂回が必要になります'; }
  else if (regDistance < 1000) { r = 0.80; why = '交通規制区間から少し離れています'; }
  else                         { r = 1.00; why = '交通規制区間から離れています'; }
  return { score: max * r, reasons: [`${why}（最寄りの規制区間まで約 ${fmtDistance(regDistance)}）`] };
}

/** 混雑予測（配点 15） */
function scoreCongestion(crowdLevel, max) {
  const r = crowdLevel === LEVELS.LOW ? 1.0 : crowdLevel === LEVELS.MID ? 0.6 : 0.25;
  return { score: max * r, reasons: [`選択した時間帯の混雑予測は「${crowdLevel}」です`] };
}

/** アクセス（配点 10） */
function scoreAccess(cand, max) {
  const s = Math.max(0, Math.min(10, cand.accessScore ?? 5));
  return { score: (max * s) / 10, reasons: [cand.accessNote || 'アクセス情報は未設定です'] };
}

/**
 * 候補地点を評価してランキング（総合点の降順）で返す
 */
export function rankCandidates({ candidates, launchSite, hubs, regulationFeatures, slot, weights }) {
  const results = candidates.map((c) => {
    const d = surfaceDistance(c.lon, c.lat, launchSite.lon, launchSite.lat);
    const bear = bearing(c.lon, c.lat, launchSite.lon, launchSite.lat);
    const pred = predict({
      lon: c.lon, lat: c.lat,
      venue: launchSite, hubs, regulationFeatures, slot,
    });

    const v = scoreVisibility(d, c, weights.visibility);
    const dist = scoreDistance(d, weights.distance);
    const reg = scoreRegulation(pred.regulationDistance, weights.regulation);
    const con = scoreCongestion(pred.crowd.level, weights.congestion);
    const acc = scoreAccess(c, weights.access);

    const breakdown = [
      { key: 'visibility', label: '花火の見えやすさ', max: weights.visibility, ...v },
      { key: 'distance',   label: '打上地点からの距離', max: weights.distance, ...dist },
      { key: 'regulation', label: '交通規制の影響',   max: weights.regulation, ...reg },
      { key: 'congestion', label: '混雑予測',         max: weights.congestion, ...con },
      { key: 'access',     label: 'アクセス',         max: weights.access, ...acc },
    ];
    const total = breakdown.reduce((s, b) => s + b.score, 0);

    return {
      candidate: c,
      total: Math.round(total * 10) / 10,
      breakdown,
      distance: d,
      bearing: bear,
      compass: compass16(bear),
      prediction: pred,
    };
  });

  results.sort((a, b) => b.total - a.total);
  results.forEach((r, i) => { r.rank = i + 1; });
  return results;
}
