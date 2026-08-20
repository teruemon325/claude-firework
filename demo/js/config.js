/* 盛岡花火3D見え方シミュレーター — デモ版の設定
 *
 * ⚠️ これはデモ版です。座標・評価値はすべて「デモ用の概算値／仮の設定値」であり、
 *    公式に確認された値ではありません。公開前に必ず実測・実確認で置き換えてください。
 */

export const DEMO_NOTICE =
  'デモ版：座標・評価値はデモ用の概算値です。公式に確認された値ではありません。';

/* データの出典と年度（画面に常時表示する） */
export const SOURCES = {
  dataYear: 2024,
  eventYear: 2026,
  plateau:
    '出典: 国土交通省 Project PLATEAU「3D都市モデル（盛岡市）」（2024年度整備・建物の調査年は2018年等）を加工して作成',
  terrain: 'PLATEAU | Mapterhorn | 国土地理院',
  event: '盛岡花火の祭典実行委員会（盛岡商工会議所）公表情報',
  eventUrl: 'https://www.ccimorioka.or.jp/hanabi/',
  checkedAt: '2026-08-20',
};

/* 背景地図（地理院タイル）
 * 出典表示が必要です。画面下部に常時表示しています。 */
export const BASEMAPS = [
  { id: 'pale',  label: '淡色地図', url: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', max: 18,
    credit: '地理院タイル（淡色地図）' },
  { id: 'std',   label: '標準地図', url: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', max: 18,
    credit: '地理院タイル（標準地図）' },
  { id: 'photo', label: '写真',     url: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg', max: 18,
    credit: '地理院タイル（全国最新写真）' },
  { id: 'none',  label: 'なし',     url: null, credit: '' },
];
export const DEFAULT_BASEMAP = 'pale';

/* 3D データ（Phase 0 で確認済みの配信 URL） */
export const DATA = {
  terrainLayerJson: 'https://tile.plateauview.mlit.go.jp/terrain/layer.json',
  buildingsLod1:
    'https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/03201-bldg-lod1-latest/tileset.json',
  buildingsLod2:
    'https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/03201-bldg-lod2-latest/tileset.json',
  regulationGeoJson: './data/traffic-regulation-2026.geojson',
};

/* 打上地点（⚠️ 公表されていないため推定値） */
export const LAUNCH_SITE = {
  name: '打上地点（推定）',
  lon: 141.1722,
  lat: 39.6545,
  isEstimated: true,
  basis:
    '主催者公表の「都南大橋下流の北上川河川敷」を基に、地図上で推定したデモ用の概算位置。公式な打上座標ではありません。',
};

/* 花火の高度（地上高 m） */
export const FIREWORK = { minAlt: 50, maxAlt: 300, defaultAlt: 200 };

/* 観覧者の目線高さ（m） */
export const EYE_HEIGHT = 1.6;

/* 時間帯（混雑・渋滞予測と規制表示に使う）
 * 時刻は 2026 年の公表情報を基にしたデモ用の区分。 */
export const TIME_SLOTS = [
  { id: 't1630', label: '16:30 開場ごろ', hhmm: '16:30', phase: 'before', crowdFactor: 0.7 },
  { id: 't1800', label: '18:00 交通規制開始', hhmm: '18:00', phase: 'before', crowdFactor: 0.9 },
  { id: 't1900', label: '19:00 打上直前', hhmm: '19:00', phase: 'before', crowdFactor: 0.95 },
  { id: 't1930', label: '19:30 打上中', hhmm: '19:30', phase: 'during', crowdFactor: 0.6 },
  { id: 't2030', label: '20:30 終了直後', hhmm: '20:30', phase: 'after', crowdFactor: 1.0 },
  { id: 't2130', label: '21:30 規制解除ごろ', hhmm: '21:30', phase: 'after', crowdFactor: 0.8 },
];
export const DEFAULT_TIME_SLOT = 't2030';

/* 混雑の起点になる拠点（駅・特設駐車場・会場出入口）
 * ⚠️ 座標はデモ用の概算値 */
export const HUBS = [
  { name: '会場出入口（想定）', kind: 'venue_gate', lon: 141.1705, lat: 39.6560 },
  { name: '盛岡市中央卸売市場 特設駐車場（シャトルバス発着）', kind: 'parking', lon: 141.1480, lat: 39.6320 },
  { name: '盛岡市都南文化会館 特設駐車場', kind: 'parking', lon: 141.1585, lat: 39.6560 },
  { name: 'JR岩手飯岡駅', kind: 'station', lon: 141.1450, lat: 39.6490 },
];

/* 評価の配点（合計 100 点） */
export const WEIGHTS = {
  visibility: 40, // 花火の見えやすさ
  distance: 20,   // 打上地点からの距離
  regulation: 15, // 交通規制の影響
  congestion: 15, // 混雑予測
  access: 10,     // アクセス
};

/* ------------------------------------------------------------------
 * 候補地点
 *
 * ★ 登録のルール（必ず守ること）
 *   - 私有地、立入禁止区域、河川管理用道路、危険箇所は登録しない
 *   - 公共の場所、または一般に立ち入りが想定される場所のみ
 *   - 「必ず見える」「安全」「公式の穴場」といった断定をしない
 *   - 情報源と確認日を必ず記入する
 *
 * ⚠️ 以下の座標・評価値はすべて【デモ用の概算値】です。
 * ---------------------------------------------------------------- */
export const CANDIDATES = [
  {
    id: 'c1',
    name: '盛岡南公園 周辺（都市公園）',
    lon: 141.1560, lat: 39.6470,
    kind: '都市公園',
    isPublic: true,
    // 見通しの想定（low = 遮るものが少ない想定 / high = 建物が多い想定）
    obstruction: 'medium',
    elevationAdvantage: 0,      // 0=平地想定, 1=やや高い, 2=高台
    accessScore: 7,             // 0〜10
    accessNote: '公園の駐車場は当日利用できない可能性あり。公共交通か徒歩を想定。',
    cautions: [
      '公園の開園時間・夜間利用の可否は事前に確認してください。',
      '当日は臨時の規制や利用制限がかかる場合があります。',
      '樹木や園内の構造物により見え方は大きく変わります（3Dには樹木が表示されません）。',
    ],
    source: '公共の都市公園として一般に知られている場所。座標はデモ用の概算値。',
    checkedAt: '2026-08-20',
  },
  {
    id: 'c2',
    name: '盛岡市都南文化会館（キャラホール）周辺',
    lon: 141.1585, lat: 39.6560,
    kind: '公共施設・特設駐車場',
    isPublic: true,
    obstruction: 'high',
    elevationAdvantage: 0,
    accessScore: 8,
    accessNote: '公表情報では大会当日の特設駐車場のひとつ。収容には限りがあります。',
    cautions: [
      '駐車場は観覧場所ではありません。施設利用者・関係者の妨げにならないようにしてください。',
      '建物が近く、方向によっては花火が隠れる可能性があります。',
      '当日の利用時間・可否は主催者の発表を確認してください。',
    ],
    source: '盛岡花火の祭典 公表情報の特設駐車場。座標はデモ用の概算値。',
    checkedAt: '2026-08-20',
  },
  {
    id: 'c3',
    name: '盛岡市中央卸売市場 周辺（特設駐車場・シャトルバス発着）',
    lon: 141.1480, lat: 39.6320,
    kind: '公共施設・特設駐車場',
    isPublic: true,
    obstruction: 'medium',
    elevationAdvantage: 0,
    accessScore: 9,
    accessNote: '公表情報ではシャトルバスの発着地点。車で来る場合の起点になります。',
    cautions: [
      '会場から離れており、花火は小さく見えます。',
      '駐車場そのものは観覧場所ではありません。',
      'シャトルバスの運行時間・混雑状況は主催者の発表を確認してください。',
    ],
    source: '盛岡花火の祭典 公表情報の特設駐車場。座標はデモ用の概算値。',
    checkedAt: '2026-08-20',
  },
  {
    id: 'c4',
    name: 'ふれあいランド岩手 周辺（公共施設）',
    lon: 141.1660, lat: 39.6555,
    kind: '公共施設',
    isPublic: true,
    obstruction: 'medium',
    elevationAdvantage: 0,
    accessScore: 5,
    accessNote: '前面道路が交通規制の対象区間に含まれます。徒歩でのアクセスを想定。',
    cautions: [
      '「ふれあいランド岩手前通り」は規制時間帯に車両通行止めになります。',
      '施設の利用者・関係車両の通行を妨げないでください。',
      '会場に近いぶん、周辺は非常に混雑することが見込まれます。',
    ],
    source: '盛岡花火の祭典 公表情報（交通規制区間として言及）。座標はデモ用の概算値。',
    checkedAt: '2026-08-20',
  },
  {
    id: 'c5',
    name: 'JR岩手飯岡駅 周辺（公共交通の拠点）',
    lon: 141.1450, lat: 39.6490,
    kind: '駅周辺',
    isPublic: true,
    obstruction: 'high',
    elevationAdvantage: 0,
    accessScore: 8,
    accessNote: '鉄道でアクセスできます。帰りの時間帯は駅周辺が混雑します。',
    cautions: [
      '駅構内・ホーム・線路周辺での立ち止まりや撮影はしないでください。',
      '建物が多く、花火が見えない方向があります。',
      '会場からは距離があります。',
    ],
    source: '公共交通機関の駅。座標はデモ用の概算値。',
    checkedAt: '2026-08-20',
  },
];
