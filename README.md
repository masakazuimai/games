# Games

CodeQuest.work で公開しているブラウザゲーム集です。

すべてビルドツールやフレームワークを使わず、HTML / CSS / JavaScript（バニラ）だけで作っています。

## ゲーム一覧

| ゲーム | 説明 | URL |
|---|---|---|
| [ディレクターが作ったウミガメのスープ](./lateral-thinking/) | 脳トレになる水平思考クイズ68問（4ジャンル×17問・全問オリジナル） | [デモ](https://codequest.work/games/lateral-thinking/) |

## 構成

- リポジトリ直下の1ディレクトリ＝1ゲーム（`index.html` を持つディレクトリがデプロイ対象）
- push すると GitHub Actions が変更のあったゲームだけを `codequest.work/games/<name>/` へ配信する

## 技術構成

- HTML / CSS / JavaScript（バニラ）
- ビルドツールなし

## ライセンス

本リポジトリのコードは学習・参考目的でのみ利用できます。商用利用・再配布は禁止です。
