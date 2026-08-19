# 05. 実装着手前の確認チェックリスト（Phase 0）

> 調査環境からは `www.geospatial.jp` / `api.plateauview.mlit.go.jp` / `www.mlit.go.jp` へ
> アクセスできなかったため（プロキシによる遮断）、以下は**通常のネットワーク環境から実施**してください。
> ここが埋まるまでコードは書きません。

---

## A. 盛岡市の 3D Tiles を特定する

盛岡市の市区町村コードは **`03201`**。

```bash
# 1) カタログ API から盛岡市のデータセットを抽出（jq 必要）
curl -s --compressed https://api.plateauview.mlit.go.jp/datacatalog/plateau-datasets \
  | jq '.datasets[] | select(.city_code=="03201")'

# 2) 建築物モデルだけに絞る
curl -s --compressed https://api.plateauview.mlit.go.jp/datacatalog/plateau-datasets \
  | jq '.datasets[] | select(.city_code=="03201" and .type_en=="bldg")
        | {name, lod, year, texture, format, spec, url}'
```

記録すること：

| 項目 | 値 |
|---|---|
| 建築物モデルの `url`（tileset.json） | |
| `lod`（1 / 2） | |
| `year`（整備年度） | |
| `texture`（true / false） | |
| `spec`（製品仕様書バージョン） | |
| 建築物以外に使えるもの（`veg` 植生 / `tran` 道路 / `frn` 都市設備） | |

```bash
# 3) 複合 tileset.json API（新方式）が使えるかを確認
curl -s -o /dev/null -w "%{http_code}\n" \
  https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/03201-bldg-lod1-latest/tileset.json
# 200 が返れば、この URL を使えば年度更新に自動追従できる
```

- [ ] 建築物 3D Tiles の URL を確定した
- [ ] LOD と整備年度を確定した
- [ ] `latest` 指定の URL が使えるか確認した

---

## B. 都南大橋周辺が整備範囲か（最重要）

- [ ] **PLATEAU VIEW**（`https://www.plateau-view.mlit.go.jp/`）で盛岡市の建築物モデルを表示し、
      **都南大橋の下流・北上川河川敷の周辺**にカメラを移動して、建物ポリゴンがあるか目視した
- [ ] LOD2 がある場合、その整備範囲に都南地区が入っているか確認した
- [ ] G空間情報センターの盛岡市データセットページで「整備範囲図」があれば確認した
- [ ] 結果を記録した：

| 確認項目 | 結果 |
|---|---|
| 会場（河川敷）周辺の建物データ | あり／なし |
| 会場から半径 1km の建物データ | あり／なし |
| 中心市街地（盛岡駅周辺）の建物データ | あり／なし |
| LOD2 の範囲 | |

> **なし**だった場合は、`02-architecture-and-plan.md` の Phase 2 以降の仕様を縮小し、
> 「会場周辺の建築物は未整備」と画面に明示する方針に切り替えます。

---

## C. 地形（PLATEAU-Terrain）

```bash
# 最新のアセット ID とトークンの記載を確認する
# （公式チュートリアル内で 3258112 と 2488101 の 2 種類の記載があるため）
open https://docs.plateauview.mlit.go.jp/datasets/terrain/
```

- [ ] 最新の Cesium ion アセット ID を確認した：`__________`
- [ ] 自分の Cesium ion アカウントを作成し、アクセストークンを取得した
- [ ] そのトークンで PLATEAU-Terrain アセットを読めるか確認した
  （読めない場合は、公式共有トークンの利用可否／Cesium World Terrain へのフォールバックを判断）
- [ ] 帰属表記の最新の指定文言を確認した（例：「地形データは、測量法に基づく国土地理院長承認（使用）R3JHs 778 を得て使用」）

---

## D. 高さ整合の実測（Phase 1 の合否判定）

最小の HTML（公式チュートリアルのサンプルを流用）で次を確認します。

- [ ] PLATEAU-Terrain ＋ 盛岡市の建築物 3D Tiles を重ねて表示した
- [ ] **都南大橋周辺**で、建物の足元が地面に接している（浮いていない・沈んでいない）
- [ ] 都南大橋付近の地表標高が、地理院地図の値（北上川の川面付近で 100m 台前半）と大きく矛盾しない
- [ ] ずれている場合、その量（m）を記録した：`__________`

---

## E. ライセンス・出典

- [ ] G空間情報センターの盛岡市データセットページで**適用ライセンス**を確認した：`__________`
- [ ] **整備年度**を確認した：`__________`
- [ ] PLATEAU サイトポリシーを確認した
- [ ] `docs/03-data-and-license.md` の出典文案を、確認結果に合わせて更新した

---

## F. 会場・イベント情報

- [ ] 主催者公式サイトで、**最新年の開催情報と交通規制**を確認した
- [ ] 交通規制の区間・時間帯を書き出した
- [ ] 地理院地図で**打上地点の概略座標**を推定し、記録した：`緯度 ______ / 経度 ______`
- [ ] 「河川管理用道路の規制」など、規制の種類ごとに時間帯が違う点を整理した
- [ ] 公式サイトの URL を `config/attribution.ts` 用に控えた

---

## G. 環境

- [ ] Node.js のバージョンを決めた（LTS 推奨）
- [ ] Cesium ion トークンを `.env`（gitignore 済み）に置く運用を決めた
- [ ] 開発マシン／想定利用端末で CesiumJS のサンプルが 30fps 以上で動くか確認した

---

## 判断ゲート

上記のうち **A / B / C / D が埋まったら Phase 1 に進みます。**
B で「会場周辺に建物なし」となった場合は、先に仕様の縮小案を決めてから進みます。
