# 02. 構成と段階的な実装計画

## 1. 技術構成

| 層 | 採用 | 補足 |
|---|---|---|
| ビルド | **Vite 5+** | `vite-plugin-cesium` を使うか、`CESIUM_BASE_URL` を定義して Cesium の静的アセット（Workers / Assets / Widgets）を `public/` にコピー |
| 言語 | **TypeScript**（`strict: true`） | |
| UI | **React 18+** | Cesium の `Viewer` は React の再レンダリングから隔離する（後述） |
| 3D | **CesiumJS**（`cesium` npm） | |
| 地形 | **PLATEAU-Terrain**（Cesium ion アセット） | フォールバック：Cesium World Terrain → `EllipsoidTerrainProvider` |
| 建物 | **PLATEAU-3DTiles**（盛岡市 `03201` bldg） | |
| 状態管理 | **Zustand**（軽量）または React Context | Redux は過剰 |
| 測地計算 | Cesium 同梱の `EllipsoidGeodesic` / `Cartesian3` | 別ライブラリ不要 |
| Lint/Format | ESLint + Prettier | |
| テスト | Vitest（`lib/geo.ts` の純関数のみ） | 3D 描画のテストは行わない |

### React と Cesium の境界（重要な設計方針）

- `Viewer` は **1 回だけ生成**し、`useRef` で保持する。React の state 更新で再生成しない。
- Cesium 側のオブジェクト（Entity / Primitive / Tileset）は **React がレンダリングしない**。
  React は「UI パネル」と「アプリ状態」だけを持ち、状態変化を `useEffect` で Cesium 側に反映する。
- `Resium`（React ラッパー）は使わない方針を推奨。Cesium の低レベル API（`sampleTerrainMostDetailed`、
  `pickFromRay`、`PostProcessStage` など）を多用するため、素の CesiumJS の方が扱いやすい。

---

## 2. フォルダ構成

```
claude-firework/
├── docs/                              # 調査・計画（本ディレクトリ）
├── public/
│   ├── cesium/                        # Cesium の静的アセット（ビルド時にコピー）
│   └── data/
│       ├── traffic-regulation-2026.geojson   # 交通規制（公式発表を基に手作業で作成）
│       ├── parking-shuttle-2026.geojson      # 任意：駐車場・シャトルバス発着（Phase 6 以降）
│       └── launch-site.json                  # 打上地点の推定座標（出典・更新日つき）
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   │
│   ├── config/
│   │   ├── plateau.ts        # 3D Tiles URL / terrain asset id / 整備年度 / LOD
│   │   │                     # ※ terrain asset id は「採用 ID・確認日・確認方法」をコメントで併記
│   │   ├── site.ts           # 打上地点、既定の観覧地点、既定カメラ、花火の高度レンジ
│   │   ├── attribution.ts    # 出典表記の文字列（画面とフッターで共用）
│   │   └── disclaimer.ts     # 免責文の文字列
│   │
│   ├── cesium/                       # CesiumJS の薄いラッパー（React 非依存）
│   │   ├── createViewer.ts           # Viewer 生成・既定設定
│   │   ├── terrain.ts                # PLATEAU-Terrain 設定＋フォールバック
│   │   ├── tilesets.ts               # 建築物 3D Tiles の読み込み・スタイル
│   │   ├── lighting.ts               # 昼／夜の切替（時刻・大気・ライティング）
│   │   ├── picking.ts                # クリック地点の取得、地盤標高の取得
│   │   └── camera.ts                 # 観覧地点への移動、花火方向への向き変更
│   │
│   ├── features/
│   │   ├── fireworks/
│   │   │   ├── FireworksLayer.ts     # 高度 50〜300m の花火の描画（Entity / ParticleSystem）
│   │   │   ├── useFireworks.ts
│   │   │   └── FireworksPanel.tsx    # 高度スライダー、打上地点の表示
│   │   ├── viewpoint/
│   │   │   ├── useViewpointPicker.ts # 地図クリック → 観覧地点確定
│   │   │   └── ViewpointPanel.tsx    # 目線高さ（既定 1.6m）の表示
│   │   ├── metrics/
│   │   │   ├── computeMetrics.ts     # 距離・方位・高低差・仰角
│   │   │   └── MetricsPanel.tsx
│   │   ├── regulation/
│   │   │   ├── loadRegulation.ts     # GeoJSON 読み込み
│   │   │   └── RegulationPanel.tsx   # 表示切替・出典・公式リンク
│   │   └── daynight/
│   │       └── DayNightToggle.tsx
│   │
│   ├── components/
│   │   ├── SidePanel.tsx
│   │   ├── AttributionBar.tsx        # 出典＋整備年度（常時表示）
│   │   ├── DisclaimerBanner.tsx      # 免責（初回モーダル＋常時の小表示）
│   │   └── LoadingOverlay.tsx
│   │
│   ├── hooks/
│   │   └── useCesiumViewer.ts        # Viewer の生成・破棄と context 提供
│   │
│   ├── lib/
│   │   ├── geo.ts                    # 測地計算の純関数（テスト対象）
│   │   └── format.ts                 # 距離・方位の表示整形（16 方位など）
│   │
│   ├── store/
│   │   └── appStore.ts               # Zustand（観覧地点・花火高度・昼夜・表示レイヤ）
│   │
│   ├── types/
│   │   └── index.ts
│   └── styles/
│
├── scripts/
│   └── fetch-plateau-catalog.ts      # カタログ API を叩き config/plateau.ts の値を生成
│
├── .env.example                      # VITE_CESIUM_ION_TOKEN（※ VITE_ 変数はブラウザに公開される）
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## 3. 段階的な実装順序

各フェーズは**動く状態で終わる**ようにします。前のフェーズが終わるまで次に進みません。

### Phase 0：データ確認（コードを書かない）

- [`05-verification-checklist.md`](05-verification-checklist.md) の全項目を実施し、記録欄を埋めてコミットする。
- 主な確認内容：
  - **整備年度**：2024 年度版を最優先で確認し、無ければ 2023 → 2022 の順に採用年度を決める。
  - **収録範囲**：建築物・地形・道路・土地利用の **4 地物型を個別に**、都南大橋周辺で実データ確認する
    （メッシュ単位の地物型についても推定で済ませない）。
  - **地形アセット**：PLATEAU-Terrain のアセット ID を固定せず、最新公式ドキュメントまたは実アクセスで
    有効性を確認し、採用 ID・確認日・確認方法を記録する。
  - **高さ整合**：都南大橋周辺で実測する。Cesium World Terrain との組み合わせは
    「ずれる可能性がある」前提で実測し、実測値のみを記録する。
  - **ion トークン**：`VITE_` 環境変数はブラウザに公開されるため、権限（スコープ）最小化とドメイン制限を設定する。
  - **昼夜ライティング**：時刻変更だけでは見た目が変わらないため、必要な設定項目を最小 HTML で確認する。
- **完了条件**：`05` 末尾の **GO / NO-GO 判定**で「GO」または「条件付き GO」と判定できること。
- **ここで結果が悪ければ、Phase 1 以降の仕様を縮小する。**

### Phase 1：土台（3D 都市モデルの表示）

> **着手条件：`05-verification-checklist.md` の GO / NO-GO 判定で 1〜7 がすべて GO であること。**
> 条件付き GO の項目（トークン設定・ライセンス確定など）は、その制約を守って進めます。

- Vite + React + TS の雛形、CesiumJS の組み込み（`CESIUM_BASE_URL` 対応）。
- PLATEAU-Terrain を設定。ion トークンは `.env` から読む。
- 盛岡市の建築物 3D Tiles を表示。初期カメラを都南大橋上空に設定。
- `AttributionBar`（出典・整備年度）と `DisclaimerBanner`（免責）を**最初から**実装する。
- **完了条件**：都南大橋周辺の地形と建物がブラウザで表示され、
  **建物が地面から浮いていない／沈んでいない**ことを目視確認できる。
- ⚠️ ここで高さのズレが出たら先に進まない（`04-risks.md` の「高さ基準」参照）。

### Phase 2：打上地点と花火の表示

- `config/site.ts` に打上地点の緯度・経度（**推定値**）を定義。
- `sampleTerrainMostDetailed` で打上地点の地盤標高を取得。
- 花火を **地上高 50〜300m** に描画（Phase 2 では球体 Entity ＋高度目盛りで十分）。
  - 内部では `地盤標高 + 地上高` を高さに使う（＝「高度」は常に**地上高**であることを UI で明示）。
- 高度スライダー（50〜300m）と、代表的な号数の目安表示（任意）。
- **完了条件**：高度を変えると花火の球が上下し、地形・建物との位置関係が見て取れる。

### Phase 3：観覧地点の指定と視点移動

- 地図クリックで観覧地点を取得（`scene.globe.pick(ray)` を基本、建物上は `scene.pickPosition` を併用）。
- 観覧地点の地盤標高を取得し、**目線 = 地盤標高 + 1.6m** にカメラを配置。
- カメラを花火方向（打上地点の方位）に向ける。ピッチは花火の高度に応じて自動調整。
- 「上空俯瞰ビュー ⇄ 観覧者目線ビュー」の切替ボタン。
- **完了条件**：任意の地点をクリックすると、その場に立った目線で花火の方を向いた絵が出る。

### Phase 4：距離・方角・高低差の表示

- `lib/geo.ts` に純関数として実装（Vitest でテスト）：
  - 水平距離：`EllipsoidGeodesic.surfaceDistance`
  - 直線距離：`Cartesian3.distance`
  - 方位角：`EllipsoidGeodesic.startHeading`（真北基準）→ 度／16 方位に変換
  - 高低差：`打上地点の地盤標高 − 観覧地点の地盤標高`
  - 仰角：`atan2(花火の標高 − 目線の標高, 水平距離)`（花火の高度別に 50m / 150m / 300m を併記すると分かりやすい）
- `MetricsPanel` に表示。方位は「真北基準」であることを明記。
- **完了条件**：数値がリアルタイムに更新され、既知の 2 地点で手計算と一致する。

### Phase 5：昼夜の切替

> **⚠️ 時計（`viewer.clock`）の時刻を変えるだけでは、昼夜の見た目はほとんど変わりません。
> ライティング設定を明示的に有効化・調整する必要があります。**
> Cesium の地表照明（`globe.enableLighting`）は**既定で無効**であり、これを有効にしない限り
> 夜間でも地表は一様に明るいまま描画されます。

- 時刻：`viewer.clock.currentTime` を昼（例：当日 12:00 JST）／夜（例：当日 20:00 JST）で切替。
  **JST → UTC の変換に注意**（`Cesium.JulianDate` は UTC 基準）。
- **必要なライティング設定（時刻変更と必ずセットで行う）**：

  | 設定 | 役割 |
  |---|---|
  | `scene.globe.enableLighting = true` | 太陽位置に応じた地表の陰影。**既定 false** |
  | `scene.globe.dynamicAtmosphereLighting` ほか大気照明系 | 大気の明るさを時刻に追従させる |
  | `scene.skyAtmosphere`（表示・明るさ） | 空の色。夜は暗くする |
  | `scene.light`（`SunLight` / `DirectionalLight`） | 3D Tiles（建物）への光の当たり方 |
  | `scene.sun` / `scene.moon` | 太陽・月の表示 |
  | `imageryLayer.brightness` / `gamma` | 夜モードで地表テクスチャの明度を落とす |
  | `Cesium3DTileStyle` の `color` | 夜モードで建物を暗くする |
  | `PostProcessStageLibrary.createBloomStage()` | 花火の発光表現。**負荷が高いため ON/OFF を設定可能にする** |
  | `viewer.shadows` / `tileset.shadows` | 影の描画。負荷とのトレードオフ |

- 昼／夜それぞれの設定値の組み合わせを `cesium/lighting.ts` に集約し、1 関数で切り替える。
- 昼：ライティングを戻し、オルソ画像（PLATEAU-Ortho）を有効化して形状を把握しやすくする。
- **完了条件**：切替ボタンで見た目が実際に変わり、夜モードで花火が視認しやすい。
  昼・夜それぞれの fps を測り、実用範囲であることを確認する。
- 注記：夜モードは**演出であり、実際の夜間の見え方（街灯・光害・煙）を再現するものではない**旨を表示。

### Phase 6：交通規制区域の表示と注意表示の仕上げ

- 公式発表（盛岡花火の祭典 公式サイト）を基に、規制区間を **GeoJSON（LineString / Polygon）で手作業作成**。
  - プロパティに `source`（出典）、`published`（発表年）、`note`、`official_url` を持たせる。
- Cesium の `GeoJsonDataSource` で読み込み、`clampToGround` で地表に貼り付け。
- 表示 ON/OFF、凡例、「**概略図です。最新・正確な情報は主催者発表を確認してください**」の注記＋公式リンク。
- 免責文・出典表記の最終確認（`03-data-and-license.md` の文案どおりになっているか）。
- **完了条件**：第 1 版の機能一覧をすべて満たし、注意事項がすべて画面上に出ている。

### デモ版（`demo/`）— 先行実装

Phase 1 の本実装に先立ち、**動くものを早く確認するためのデモ版**を `demo/` に実装済み。
ビルド不要（CesiumJS 1.117 を CDN から読み込む素の HTML + ES モジュール）。

| デモ版で実装済み | 内容 |
|---|---|
| 3D 都市モデル表示 | 建築物 LOD1 / LOD2 切替、PLATEAU-Terrain |
| 花火の表示 | 打上地点（推定）に地上高 50〜300m |
| 観覧候補地点のランキング | 設定ファイル登録の候補のみを 100 点満点で評価（見えやすさ40／距離20／規制15／混雑15／アクセス10） |
| 交通規制の表示 | 公表内容を基に再作図した GeoJSON を赤色表示。規制時間・都南大橋の全面通行禁止時間・対象年度を常時表示 |
| 混雑予測 / 渋滞予測 | 時間帯選択つき。低い/中程度/高い の 3 段階と根拠を表示 |
| 視点移動・昼夜切替・出典/免責 | 目線 1.6m、昼夜、常時表示の出典バーと初回モーダル |

**デモ版で実装していないこと**

- 建物による遮蔽の実計算（設定値による想定のみ。`04-risks.md` R5）
- 地図クリックによる任意地点の指定（候補は設定ファイル登録のみ）
- リアルタイム交通情報との連携（下記の将来機能）

**Phase 1 では、このデモ版を React + TypeScript + Vite に移植する。**
`geo.js` / `scoring.js` / `congestion.js` は Cesium に依存しない純関数として書いてあるため、
そのまま TypeScript 化してテストを付けられる。

### Phase 7（第 2 版以降の候補：この計画には含めない）

- 遮蔽（見通し）の簡易判定 — 技術的制約が大きい（`04-risks.md` 参照）。実装するなら
  「サンプリング法」＋**信頼度の低さを明記**する形で。
- 複数の観覧地点を比較、URL 共有（座標をクエリパラメータ化）。
- スマートフォン向け最適化、負荷軽減（`maximumScreenSpaceError` の動的調整）。
- 打上プログラム（号数・時刻）に応じた高度プリセット。
- 自前ホスティングへの切替（配信サービス停止時のフォールバック）。
- **JARTIC（日本道路交通情報センター）等のリアルタイム交通情報との連携**
  — デモ版では「混雑予測 / 渋滞予測」として実装しており、リアルタイム連携は未実装。
  実装する場合は、予測とリアルタイム情報を画面上で明確に区別すること。
- 過去の実測データによる混雑度の較正、駐車場の満空情報、シャトルバスの運行状況の反映。

---

## 4. 状態モデル（アプリ全体）

```ts
type AppState = {
  launchSite: { lon: number; lat: number; groundHeight: number | null; isEstimated: true };
  fireworkAltitudeAGL: number;        // 50〜300（地上高 m）
  viewpoint: { lon: number; lat: number; groundHeight: number } | null;
  eyeHeight: number;                  // 既定 1.6
  timeOfDay: 'day' | 'night';
  cameraMode: 'overview' | 'eyeLevel';
  layers: { buildings: boolean; regulation: boolean; ortho: boolean };
};
```

派生値（距離・方位・高低差・仰角）は state に持たず、`computeMetrics()` で都度算出します。
