# 盛岡花火3D見え方シミュレーター（調査・計画フェーズ）

盛岡市の PLATEAU 3D都市モデルを使い、**都南大橋下流・北上川河川敷**で打ち上げられる花火が
市内の各地点からどのように見えるかを、ブラウザ上で 3D 表示して確かめるための Web アプリです。

> **現在のステータス：調査・計画のみ。アプリケーションコードはまだ 1 行も書いていません。**
> このリポジトリには実現可能性調査の結果と段階的な実装計画のみが入っています。

## ドキュメント

| ファイル | 内容 |
|---|---|
| [docs/01-feasibility.md](docs/01-feasibility.md) | 実現可能性調査（データ入手先・整備範囲・LOD・3D Tiles・地形・表示方式・ライセンス） |
| [docs/02-architecture-and-plan.md](docs/02-architecture-and-plan.md) | フォルダ構成・技術選定・段階的な実装順序（Phase 0〜7） |
| [docs/03-data-and-license.md](docs/03-data-and-license.md) | 必要データ一覧・出典表記の文案・画面表示する免責文の文案 |
| [docs/04-risks.md](docs/04-risks.md) | 技術上の問題点とリスク、その回避方針 |
| [docs/05-verification-checklist.md](docs/05-verification-checklist.md) | 実装着手前に**自分の手で**確認すべき項目とコマンド |

## 結論（要約）

- **技術的に実現可能**。React + TypeScript + Vite + CesiumJS + PLATEAU 配信サービス（3D Tiles / Terrain）で、
  第 1 版の機能一覧はすべて実装できる見込み。
- ただし着手前に **3 点の実データ確認**が必須（詳細は `docs/05-verification-checklist.md`）。
  1. 盛岡市（市区町村コード `03201`）の建築物 3D Tiles が配信サービスに存在するか、LOD はいくつか
  2. 都南大橋周辺（盛岡市南部・都南地区）が建築物モデルの整備範囲に入っているか
  3. PLATEAU-Terrain と PLATEAU-3DTiles を重ねたとき、建物が地面から浮かない／沈まないか（高さ基準の整合）
- 本アプリは **「見える／見えない」を判定するものではなく、見え方を考えるための参考ツール**として設計する。
  樹木・看板・煙・天候・仮設物・当日の人出は再現できないため、画面上に常時その旨を表示する。

## ライセンス・出典

利用するデータの出典表記と免責の文案は [docs/03-data-and-license.md](docs/03-data-and-license.md) を参照してください。
