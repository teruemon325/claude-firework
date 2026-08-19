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
├── .env.example                      # VITE_CESIUM_ION_TOKEN
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## 3. 段階的な実装順序

各フェーズは**動く状態で終わる**ようにします。前のフェーズが終わるまで次に進みません。

### Phase 0：データ確認（コードを書かない）

- `05-verification-checklist.md` の全項目を実施。
- **完了条件**：盛岡市の建築物 3D Tiles の URL・LOD・整備年度が確定し、
  都南大橋周辺に建物データがあるか否かが判明していること。
- **ここで結果が悪ければ、Phase 1 以降の仕様を縮小する。**

### Phase 1：土台（3D 都市モデルの表示）

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

- `viewer.clock.currentTime` を昼（例：当日 12:00 JST）／夜（例：当日 20:00 JST）で切替。
- 夜：`globe.enableLighting = true`、`scene.skyAtmosphere` 調整、地表の明度を下げる、
  3D Tiles のスタイルで建物を暗くする、花火に `PostProcessStageLibrary.createBloomStage` を適用。
- 昼：ライティングを戻し、オルソ画像（PLATEAU-Ortho）を有効化して形状を把握しやすくする。
- **完了条件**：切替ボタンで見た目が変わり、夜モードで花火が視認しやすい。
- 注記：夜モードは**演出であり、実際の夜間の見え方（街灯・光害・煙）を再現するものではない**旨を表示。

### Phase 6：交通規制区域の表示と注意表示の仕上げ

- 公式発表（盛岡花火の祭典 公式サイト）を基に、規制区間を **GeoJSON（LineString / Polygon）で手作業作成**。
  - プロパティに `source`（出典）、`published`（発表年）、`note`、`official_url` を持たせる。
- Cesium の `GeoJsonDataSource` で読み込み、`clampToGround` で地表に貼り付け。
- 表示 ON/OFF、凡例、「**概略図です。最新・正確な情報は主催者発表を確認してください**」の注記＋公式リンク。
- 免責文・出典表記の最終確認（`03-data-and-license.md` の文案どおりになっているか）。
- **完了条件**：第 1 版の機能一覧をすべて満たし、注意事項がすべて画面上に出ている。

### Phase 7（第 2 版以降の候補：この計画には含めない）

- 遮蔽（見通し）の簡易判定 — 技術的制約が大きい（`04-risks.md` 参照）。実装するなら
  「サンプリング法」＋**信頼度の低さを明記**する形で。
- 複数の観覧地点を比較、URL 共有（座標をクエリパラメータ化）。
- スマートフォン向け最適化、負荷軽減（`maximumScreenSpaceError` の動的調整）。
- 打上プログラム（号数・時刻）に応じた高度プリセット。
- 自前ホスティングへの切替（配信サービス停止時のフォールバック）。

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
