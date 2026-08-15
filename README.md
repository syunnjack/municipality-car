# 全国市区町村 車買取データナビ

全国の市区町村・車種から査定前の確認項目を探し、複数の提示条件を端末内で比較できる静的サイトです。

## ローカル確認

```bash
npm run check
python3 -m http.server 4173 --directory dist
```

`npm run check` はサイトを生成した後、次を自動監査します。

- 自治体データ件数と自治体コード
- canonical、robots、Open Graph、JSON-LD
- インデックス対象ページとサイトマップの一致
- 重複タイトル、壊れた内部リンク、プレースホルダー
- 地域検索用データの件数

## インデックス方針

全地域ページは検索・閲覧できますが、検索エンジンへ一括登録しません。既存公開URLのある主要地域だけを `index,follow` とし、それ以外は独自情報を追加するまで `noindex,follow` にします。対象は `data/legacy-city-paths.json` で管理します。

## データ更新

ビルド時に `localgovjp` の自治体データを取得し、件数・必須項目・コード重複を検査します。別URLを利用する場合は `MUNICIPALITY_DATA_URL` を指定できます。

## デプロイ

VercelのBuild Commandは `npm run check`、Output Directoryは `dist` です。監査に失敗したビルドは公開されません。
