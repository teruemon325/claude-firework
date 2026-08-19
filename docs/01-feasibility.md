# 01. 実現可能性調査

調査日：2026-08-19

## 凡例

| 記号 | 意味 |
|---|---|
| ✅ | 一次情報（公式ドキュメント）で確認済み |
| 🔶 | 公式サイトの検索結果・二次情報で確認。実データでの再確認を推奨 |
| ⚠️ | **未確認。実装着手前に必ず自分で確認すること**（→ `05-verification-checklist.md`） |

> **調査環境の制約について**
> 今回の調査環境は外向き通信が制限されており、`www.geospatial.jp` / `docs.plateauview.mlit.go.jp` /
> `api.plateauview.mlit.go.jp` / `www.mlit.go.jp` に直接アクセスできませんでした（プロキシが 403 を返す）。
> そのため、公式 GitHub（`raw.githubusercontent.com` 経由で取得できた
> `Project-PLATEAU/plateau-streaming-tutorial`）と検索結果を根拠としています。
> ⚠️ が付いた項目は、通常のネットワーク環境から必ず再確認してください。

---

## 1. 盛岡市の PLATEAU データの入手先

| 入手経路 | 用途 | 状態 |
|---|---|---|
| **G空間情報センター**<br>`https://www.geospatial.jp/ckan/dataset/plateau-03201-morioka-shi-2022` | CityGML / 3D Tiles / MVT / GeoJSON の**一括ダウンロード**（自前ホスティング用） | 🔶 データセットの存在を確認 |
| **PLATEAU 配信サービス（試験運用）**<br>データカタログ API `https://api.plateauview.mlit.go.jp/datacatalog/plateau-datasets` | 3D Tiles / MVT を**ストリーミングで直接読み込む**（本アプリの本命） | ✅ API 仕様を確認 |
| **PLATEAU-Terrain**（Cesium ion 経由） | 地形（quantized-mesh） | ✅ 公式チュートリアルで確認 |
| **PLATEAU-Ortho**<br>`https://api.plateauview.mlit.go.jp/tiles/plateau-ortho-2023/{z}/{x}/{y}.png` | 航空写真オルソ（地表テクスチャ） | ✅ URL 形式を確認 |

- 盛岡市の市区町村コードは **`03201`**（データセット slug `plateau-03201-morioka-shi-2022` から確定）。
- 🔶 公開されている盛岡市データは **2022 年度（令和 4 年度）整備**。標準製品仕様書 **v2 系**に準拠。
  ⚠️ より新しい年度（2023・2024・2025 年度）に更新されていないかは、着手時点で必ず確認すること。

### 配信サービスからの取得方法（2 通り）

1. **カタログ API で URL を引く（推奨）**

   ```
   GET https://api.plateauview.mlit.go.jp/datacatalog/plateau-datasets
   ```

   レスポンスの各要素は `city_code` / `type_en` / `lod` / `year` / `texture` / `url` を持つ。
   `city_code == "03201"` かつ `type_en == "bldg"` の要素の `url`（= `tileset.json` の URL）を使う。
   ✅ スキーマは公式チュートリアルで確認済み。
   ⚠️ レスポンスは約 2MB あるため、**実行時に毎回叩くのではなく、ビルド時／開発時に 1 回引いて
   結果を設定ファイルに固定する**運用にすること。

2. **複合 tileset.json API（新方式）**

   ```
   GET https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/{spec}/tileset.json
   例: .../3dtiles/03201-bldg-lod1-latest/tileset.json
   ```

   `{spec}` は `<自治体コード>-<地物型>-<LOD>[-interior][-<texture>]-<年度|latest>`。
   `latest` を指定すると新年度データ公開時に URL 変更なしで追従する。
   🔶 URL 書式は公式ドキュメントサイトの記載（検索経由）で確認。⚠️ 実 URL の疎通は要確認。

---

## 2. 都南大橋周辺がデータ整備範囲に含まれるか

⚠️ **未確認。最重要の確認項目。**

- 花火会場は「都南大橋下流の北上川河川敷」。都南大橋は盛岡市**向中野〜三本柳**付近（旧・都南村域）で、
  盛岡市中心部から南へ約 5〜6km の位置にあります。
- PLATEAU の**地形モデル・土地利用モデル・都市計画決定情報モデル**は 2 次メッシュ（約 10km 四方）単位、
  **道路モデル**は 3 次メッシュ（約 1km 四方）単位で整備されており（🔶）、この粒度なら都南地区は
  ほぼ確実に含まれます。
- 一方 **建築物モデルは「都市計画区域」等を単位に整備範囲が決まる**ため、
  都南地区が LOD1 の整備範囲に入っているか、また **LOD2（屋根形状つき）は中心市街地のみ**という
  可能性が高い点を、実データで確認する必要があります。
- 確認方法（いずれか）：
  - PLATEAU VIEW（`https://www.plateau-view.mlit.go.jp/`）で盛岡市の建築物モデルを表示し、
    都南大橋周辺にポリゴンがあるか目視する（最速）。
  - カタログ API から取得した `tileset.json` を CesiumJS で読み、都南大橋周辺へカメラを飛ばす。
  - G空間情報センターの盛岡市データセットページで「整備範囲図」PDF を確認する。

> **想定される結果と対応**
> - 都南地区に LOD1 建物がある → そのまま進行（第 1 版としては十分）。
> - 都南地区に建物がない → 会場周辺の遮蔽物は表現できない。**「会場付近の建物は未整備」と明示**し、
>   地形＋遠方（中心市街地側）の建物で見え方を検討するツールとして仕様を縮小する。
> - 建物が古い（2022 年度時点） → 「データは 2022 年度時点。以降の新築・解体は反映されない」と明示。

---

## 3. 利用できる建築物 LOD

- ✅ PLATEAU の建築物モデルは **LOD0 / LOD1 / LOD2** のマルチスケール構造。
  - **LOD1**：高さを持つ箱型。テクスチャなし。全整備範囲で提供されるのが基本。
  - **LOD2**：屋根形状・壁面を表現。航空写真テクスチャ付きの場合あり。整備範囲は限定的。
- ✅ 配信サービスのカタログ API は各データセットに `lod`（"1" / "2" など）と `texture`（真偽値）を持つ。
- ⚠️ **盛岡市に LOD2 があるか、あるとして範囲はどこか**は未確認。

### 本アプリでの必要十分性

| 用途 | 必要 LOD | 備考 |
|---|---|---|
| 花火の遮蔽・見え方の概算 | **LOD1 で十分** | 遮蔽は「建物の高さ」でほぼ決まるため |
| 見た目のリアリティ、屋上・屋根越しの検討 | LOD2 | あれば使う。なければ LOD1 で代替 |

**方針：LOD2 があれば LOD2、なければ LOD1 を使う。設定ファイルで切り替えられるようにし、
UI に「表示中のモデル：建築物 LOD1（2022 年度）」のように明示する。**

---

## 4. 3D Tiles 形式が利用できるか

✅ **利用できる。**

- 🔶 盛岡市（2022 年度）のデータは CityGML 2.0 のほか **3D Tiles / MVT / GeoJSON** 形式でも提供。
- ✅ PLATEAU 配信サービスは **3D Tiles 1.0** を配信。CesiumJS からは
  `Cesium.Cesium3DTileset.fromUrl(url)` で読み込むだけで表示できる。
- ✅ 配信 URL の実体は `https://assets.cms.plateau.reearth.io/assets/.../tileset.json` の形（公式サンプルで確認）。

```js
// 公式チュートリアルのサンプル（千代田区の例）
Cesium.Cesium3DTileset.fromUrl(
  'https://assets.cms.plateau.reearth.io/assets/0e/e5948a-.../13101_chiyoda-ku_..._bldg_3dtiles_..._lod1/tileset.json'
).then((tileset) => { viewer.scene.primitives.add(tileset); });
```

⚠️ **注意：配信サービスは公式に「試験的な運用であり、提供期間やサービスレベルは保証しない。
データ内容・API スキーマは予告なく変更されることがある」と明記されています。**
→ 本番運用するなら、G空間情報センターから CityGML / 3D Tiles を落として
**自前ホスティングに切り替えられる構成**にしておくこと（`04-risks.md` 参照）。

---

## 5. 地形データが含まれているか

✅ **含まれる。かつ Cesium 用の地形配信も公式に用意されている。**

| 選択肢 | 内容 | 評価 |
|---|---|---|
| **PLATEAU-Terrain**（推奨） | 基盤地図情報 数値標高モデル **5m メッシュ**基本（無い所は 10m）、ジオイドは「日本のジオイド2011 (Ver.2.2)」。quantized-mesh を `.terraindb` 化し **Cesium ion 経由**で配信 | ✅ 日本国内で最も詳細。PLATEAU 建物と高さ基準が揃う |
| Cesium World Terrain | 全球。日本域は PLATEAU-Terrain より粗い | フォールバック用 |
| PLATEAU 地形モデル（CityGML, TIN） | G空間情報センターからダウンロード。自前で quantized-mesh 化も可能 | 自前ホスティング時の原本 |
| 地理院 標高タイル / Mapbox Terrain-RGB | MapLibre 系を使う場合。公式に `PLATEAU Mapbox Terrain Converter` あり | 今回は不要 |

✅ 公式チュートリアル記載の利用方法：

```js
Cesium.Ion.defaultAccessToken = "<公式チュートリアル記載の共有トークン>";
viewer.scene.setTerrain(
  new Cesium.Terrain(Cesium.CesiumTerrainProvider.fromIonAssetId(3258112))
);
```

⚠️ **注意点**
- 公式チュートリアル内でも **アセット ID が 2 箇所で食い違っています**
  （地形チュートリアル：`3258112` / 3D Tiles チュートリアル：`2488101`）。
  最新の値は公式ドキュメントサイトで確認し、**設定ファイル（環境変数）に切り出す**こと。
- チュートリアルに書かれている ion トークンは**共有トークン**です。継続運用するなら
  **自分の Cesium ion アカウントのトークン**を使うか、`Cesium-Terrain-Builder` / `Cesium-Terrain-Server`
  による自前配信（公式が付録で案内）を検討してください。
- 地形は 5m メッシュ DEM 由来のため、**河川敷の微地形・堤防・護岸は平滑化**されます。
  河川敷での目線高さは数 m の誤差を含むと考えるべきです。

---

## 6. ブラウザ上で表示する最適な方法

**結論：React + TypeScript + Vite + CesiumJS が最適。** 提示された技術候補のままで問題ありません。

| 候補 | 適合性 |
|---|---|
| **CesiumJS**（採用） | 実標高・楕円体座標をそのまま扱える／3D Tiles と quantized-mesh terrain のネイティブ対応／PLATEAU 公式チュートリアルが CesiumJS ベース／太陽位置に基づく昼夜表現が標準機能／`sampleTerrainMostDetailed` などの標高取得 API がある |
| MapLibre GL JS | 軽量だが 3D Tiles 非対応（別途変換が必要）。標高は Terrain-RGB。花火の「高度 300m の点」を実座標で置くのが不得手 |
| deck.gl | Tile3DLayer で 3D Tiles は読めるが、地形との高さ整合や太陽光表現の作り込みが増える |
| three.js 自作 | 地理座標・地形・LOD をすべて自作することになり非現実的 |

補足：
- CesiumJS は `viewer.clock` の時刻に応じて太陽位置が変わるため、**昼夜切替は「時刻を変える」だけで自然に実現**できます。
- Vite との組み合わせは `vite-plugin-cesium` もしくは `CESIUM_BASE_URL` の手動設定で対応します（`02` 参照）。

---

## 7. データのライセンスと出典表記

- 🔶 PLATEAU の 3D 都市モデルの**著作権は各地方公共団体に帰属**し、
  **公共データ利用規約（第1.0版）、CC BY 4.0、ODC BY、ODbL** のいずれかのオープンライセンスで提供されています。
  **商用利用・改変・再配布が可能**ですが、**クレジット表記が必要**です。
  ⚠️ 盛岡市データセットの実際のライセンス表記は、G空間情報センターのデータセットページで必ず確認してください
  （データセットごとに異なる場合があります）。
- ✅ **PLATEAU-Terrain を使う場合の指定文言（公式チュートリアルに明記）**：

  > 地形データは、測量法に基づく国土地理院長承認（使用）R3JHs 778 を得て使用

- 交通規制情報は**オープンデータではありません**。主催者（盛岡花火の祭典実行委員会／盛岡商工会議所）の
  公表資料に基づく**概略の再作図**とし、図そのものの転載は避け、出典と「最新は公式発表を確認」の
  リンクを併記します。

具体的な表記文案・免責文案は [`03-data-and-license.md`](03-data-and-license.md) にまとめています。

---

## 8. 会場・イベント情報（前提条件）

🔶 検索により確認した内容（**実装時は必ず公式サイトで最新情報に更新**）：

- 大会名：**盛岡花火の祭典**（主催：盛岡花火の祭典実行委員会 / 盛岡商工会議所）
- 会場：盛岡市**都南大橋下流の北上川河川敷**
- 例年の交通規制（2026 年の例）：18:00〜21:30 に
  「盛岡南IC入口交差点〜国道396号 都南大橋東袂交差点」および「ふれあいランド岩手前通り」で車両通行止め。
  河川管理用道路は前日 9:00〜当日 22:00 通行止め。
- 打上時間帯：おおむね 19:25〜20:30 頃。

⚠️ **打上地点の正確な緯度経度は公表されていません。**
地理院地図等で河川敷を確認して概略座標を設定し、UI 上で必ず **「推定位置」** と明示してください。
座標は設定ファイル（`src/config/site.ts`）に切り出し、後から差し替えられるようにします。

---

## 参考リンク

- [3D都市モデル（Project PLATEAU）盛岡市（2022年度） - G空間情報センター](https://www.geospatial.jp/ckan/dataset/plateau-03201-morioka-shi-2022)
- [PLATEAU 配信サービス ドキュメント](https://docs.plateauview.mlit.go.jp/)
- [PLATEAU-3DTiles / MVT 配信チュートリアル（GitHub）](https://github.com/Project-PLATEAU/plateau-streaming-tutorial/blob/main/3d-tiles/plateau-3dtiles-streaming.md)
- [PLATEAU-Terrain 配信チュートリアル（GitHub）](https://github.com/Project-PLATEAU/plateau-streaming-tutorial/blob/main/terrain/plateau-terrain-streaming.md)
- [PLATEAU FAQ（ライセンス）](https://www.mlit.go.jp/plateau/faq/)
- [PLATEAU サイトポリシー](https://www.mlit.go.jp/plateau/site-policy/)
- [盛岡花火の祭典 公式](https://www.ccimorioka.or.jp/hanabi/)
- [Visualizing 3D Terrain – Cesium](https://cesium.com/learn/cesiumjs-learn/cesiumjs-terrain/)
