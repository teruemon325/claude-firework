/*
 * verify/config.example.js
 *
 * Phase 0 の高さ整合確認（verify/height-alignment.html）で使う設定の「例」です。
 *
 * 使い方:
 *   1. このファイルを verify/config.local.js にコピーする
 *   2. コピーした config.local.js の値を、自分の確認内容に合わせて書き換える
 *   3. config.local.js は .gitignore 済み。コミットしないこと
 *
 * 注意:
 *   - このファイル（config.example.js）には、トークンや秘密情報を書かないこと。
 *   - 今回の構成では Cesium ion のトークンは不要です（cesiumIonToken は null のまま）。
 */

window.VERIFY_CONFIG = {
  /* ------------------------------------------------------------------
   * 記録用のメタ情報（画面右上の情報パネルに表示され、コピーできます）
   * ---------------------------------------------------------------- */
  meta: {
    // 確認を実施した日。確認のたびに書き換える
    checkedAt: '2026-08-20',
    // 確認者（任意）
    checkedBy: '',
    // 採用した 3D 都市モデルの整備年度（Phase 0 Step 1 で 2024 年度に確定）
    dataYear: 2024,
    // 製品仕様書バージョン（Phase 0 Step 1 の実測値）
    spec: '4.1',
    // このHTMLが読み込む CesiumJS のバージョン。
    // height-alignment.html の <script src> と必ず一致させること
    cesiumVersion: '1.117',
  },

  /* ------------------------------------------------------------------
   * 地形（PLATEAU-Terrain）
   * Cesium ion を経由しない直接配信を使う。トークン不要。
   * 出典: https://docs.plateauview.mlit.go.jp/datasets/terrain/
   * ---------------------------------------------------------------- */
  terrain: {
    layerJsonUrl: 'https://tile.plateauview.mlit.go.jp/terrain/layer.json',
    // quantized-mesh の法線を要求する（陰影が付いて起伏が見やすくなる）
    requestVertexNormals: true,
    // 参考値。今回は使用しない（Cesium ion 経由で使う場合のアセットID）
    ionAssetIdForReference: 3258112,
    // 公式が指定する帰属表示。画面下部に常時表示する
    attribution: 'PLATEAU | Mapterhorn | 国土地理院',
  },

  /* ------------------------------------------------------------------
   * 建築物モデル（PLATEAU-3DTiles）
   * latest 指定の複合 tileset.json を使う（年度更新に自動追従）
   * ---------------------------------------------------------------- */
  buildings: [
    {
      label: '建築物 LOD1',
      url: 'https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/03201-bldg-lod1-latest/tileset.json',
    },
    {
      label: '建築物 LOD2',
      url: 'https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/03201-bldg-lod2-latest/tileset.json',
    },
  ],
  // 起動時に読み込む buildings の添字
  defaultBuildingIndex: 0,

  // 建築物モデルの出典表示（画面下部に常時表示する）
  buildingsAttribution:
    '出典: 国土交通省 Project PLATEAU「3D都市モデル（盛岡市）」（2024年度整備）を加工して作成',

  /* ------------------------------------------------------------------
   * カメラのプリセット
   *
   * ⚠️ 下の座標は「都南大橋のおおよその位置」として置いた【推定値】です。
   *    正確な値ではありません。画面左下に現在のカメラ座標が出るので、
   *    実際に都南大橋の上まで移動して読み取り、この値を書き換えてください。
   * ---------------------------------------------------------------- */
  cameras: [
    {
      label: '① 俯瞰（広域）',
      lon: 141.1520, lat: 39.6510, height: 2500,
      heading: 0, pitch: -60,
      note: '都南大橋周辺の全体像。建物の分布を確認する',
    },
    {
      label: '② 都南大橋の近く',
      lon: 141.1520, lat: 39.6440, height: 600,
      heading: 350, pitch: -30,
      note: '橋と河川敷を斜めから見る',
    },
    {
      label: '③ 会場（下流側）',
      lon: 141.1550, lat: 39.6400, height: 400,
      heading: 340, pitch: -25,
      note: '都南大橋より下流（南）の河川敷',
    },
    {
      label: '④ 低高度（足元確認）',
      lon: 141.1500, lat: 39.6480, height: 120,
      heading: 90, pitch: -8,
      note: '★高さ整合の判定用。建物の足元が地面に接しているかを見る',
    },
  ],
  // 起動時に使う cameras の添字
  defaultCameraIndex: 0,

  /* ------------------------------------------------------------------
   * 表示に関する設定
   * ---------------------------------------------------------------- */
  display: {
    // 背景画像タイル。null なら画像なし（地形の陰影のみ）。
    // 使う場合は PLATEAU-Ortho などの URL テンプレートを指定し、
    // その出典表示も extraAttributions に追加すること。
    imageryUrlTemplate: null,
    // 例: 'https://api.plateauview.mlit.go.jp/tiles/plateau-ortho-2023/{z}/{x}/{y}.png'
    imageryMaximumLevel: 19,

    // 地形の起伏を見やすくするための陰影。高さ判定の妨げになる場合は false に
    enableLighting: true,
    // 陰影を固定するための時刻（UTC）。既定は JST 12:00 相当
    fixedTimeIso: '2026-08-11T03:00:00Z',

    // 画像タイルを使わないときの地表の色
    globeBaseColor: '#d8d8d0',

    // 追加で表示したい出典表記があればここに文字列で追加
    extraAttributions: [],
  },

  /* ------------------------------------------------------------------
   * Cesium ion
   *
   * 今回の構成では不要なので null のままにしてください。
   * どうしても必要になった場合のみ config.local.js 側に書きます。
   * config.local.js は .gitignore 済みで、リポジトリには入りません。
   *
   * ⚠️ ただし、フロントエンドに書いたトークンはブラウザから読み取れます。
   *    「秘密にできない」前提で、権限の最小化とドメイン制限を必ず設定してください。
   * ---------------------------------------------------------------- */
  cesiumIonToken: null,
};
