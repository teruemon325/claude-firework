/* 混雑予測・渋滞予測（デモ版）
 *
 * ⚠️ リアルタイム情報ではありません。過去の一般的な傾向と公表情報から組み立てた
 *    「予測」であり、実際の混雑・渋滞を保証するものではありません。
 *    JARTIC 等のリアルタイム交通情報との連携は将来機能（未実装）です。
 */
import { surfaceDistance, distanceToLineFeatures, fmtDistance } from './geo.js';

export const LEVELS = { LOW: '低い', MID: '中程度', HIGH: '高い' };

function levelFromScore(s) {
  if (s < 0.35) return LEVELS.LOW;
  if (s < 0.60) return LEVELS.MID;
  return LEVELS.HIGH;
}

/** 会場までの距離による係数 */
function venueFactor(d) {
  if (d < 500) return { v: 1.0, why: `会場から ${fmtDistance(d)}。会場のすぐ近くで、人が集中しやすい範囲です。` };
  if (d < 1500) return { v: 0.8, why: `会場から ${fmtDistance(d)}。徒歩圏で、人の流れが集まりやすい範囲です。` };
  if (d < 3000) return { v: 0.55, why: `会場から ${fmtDistance(d)}。周辺部で、人出は会場ほどではない想定です。` };
  if (d < 5000) return { v: 0.35, why: `会場から ${fmtDistance(d)}。会場から離れており、人出は限られる想定です。` };
  return { v: 0.2, why: `会場から ${fmtDistance(d)}。会場から大きく離れています。` };
}

/** 規制区間との位置関係による係数 */
function regulationFactor(lon, lat, features) {
  if (!features || !features.length) {
    return { v: 0.3, why: '交通規制データを読み込めていないため、規制の影響は評価していません。' };
  }
  const { distance, feature } = distanceToLineFeatures(lon, lat, features);
  const name = feature?.properties?.name ?? '規制区間';
  const time = feature?.properties?.timeRange ?? '';
  if (distance < 150) return { v: 1.0, distance, why: `「${name}」（${time}）のすぐそば（約 ${fmtDistance(distance)}）です。` };
  if (distance < 400) return { v: 0.75, distance, why: `「${name}」（${time}）から約 ${fmtDistance(distance)} の近さです。` };
  if (distance < 1000) return { v: 0.45, distance, why: `最寄りの規制区間「${name}」まで約 ${fmtDistance(distance)} です。` };
  return { v: 0.2, distance, why: `最寄りの規制区間まで約 ${fmtDistance(distance)} 離れています。` };
}

/** 駅・駐車場・会場出入口との距離による係数 */
function hubFactor(lon, lat, hubs) {
  let best = null;
  for (const h of hubs) {
    const d = surfaceDistance(lon, lat, h.lon, h.lat);
    if (!best || d < best.d) best = { d, h };
  }
  if (!best) return { v: 0.2, why: '拠点データがありません。' };
  const label = `${best.h.name}（約 ${fmtDistance(best.d)}）`;
  if (best.d < 300) return { v: 1.0, why: `最寄りの拠点は ${label}。人の乗降・出入りが集中します。` };
  if (best.d < 800) return { v: 0.7, why: `最寄りの拠点は ${label}。人の流れの動線上にあたる可能性があります。` };
  if (best.d < 1500) return { v: 0.4, why: `最寄りの拠点は ${label}。` };
  return { v: 0.2, why: `最寄りの拠点は ${label}。拠点からは離れています。` };
}

function timeWhy(slot) {
  switch (slot.phase) {
    case 'before': return `${slot.label}：会場へ向かう人と車が増える時間帯です。`;
    case 'during': return `${slot.label}：多くの人が観覧中で、移動そのものは少ない時間帯です。`;
    case 'after':  return `${slot.label}：一斉に帰り始めるため、最も混みやすい時間帯です。`;
    default: return slot.label;
  }
}

/**
 * 混雑予測（人出）と渋滞予測（車）を返す
 * @returns {{crowd:{level,score,reasons[]}, traffic:{level,score,reasons[]}}}
 */
export function predict({ lon, lat, venue, hubs, regulationFeatures, slot }) {
  const dVenue = surfaceDistance(lon, lat, venue.lon, venue.lat);
  const vf = venueFactor(dVenue);
  const rf = regulationFactor(lon, lat, regulationFeatures);
  const hf = hubFactor(lon, lat, hubs);
  const tf = slot.crowdFactor;

  // 人出の混雑
  const crowdBase = 0.50 * vf.v + 0.30 * hf.v + 0.20 * rf.v;
  const crowdScore = Math.min(1, crowdBase * tf);

  // 車の渋滞（規制と拠点＝駐車場の影響を重く見る）
  const trafficBase = 0.30 * vf.v + 0.30 * hf.v + 0.40 * rf.v;
  const trafficScore = Math.min(1, trafficBase * tf);

  const common = [vf.why, hf.why, rf.why, timeWhy(slot)];
  return {
    venueDistance: dVenue,
    regulationDistance: rf.distance,
    crowd: {
      level: levelFromScore(crowdScore),
      score: crowdScore,
      reasons: common,
    },
    traffic: {
      level: levelFromScore(trafficScore),
      score: trafficScore,
      reasons: [
        ...common,
        '車の場合は、規制区間の内側・近接ほど迂回と滞留が起きやすくなります。',
      ],
    },
  };
}

/** 将来機能（今回は未実装） */
export const FUTURE_WORK = [
  'JARTIC（日本道路交通情報センター）等のリアルタイム交通情報との連携',
  '過去の実測データに基づく混雑度の較正',
  '駐車場の満空情報の取り込み',
  'シャトルバスの運行状況の反映',
];
