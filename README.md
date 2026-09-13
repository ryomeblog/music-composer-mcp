# music-composer-mcp

ゲームのBGM（曲）とSE（効果音）を、AIエージェント（Claude Codeなど）から生成できるようにするMCPサーバー群です。
既存の音楽制作ソフトをAIに操作させるのではなく、**音楽・効果音を生成するサーバー自体をゼロから自作し、それをMCPツールとして提供する**アプローチを取っています。

開発の背景・設計判断の経緯は [HANDOFF.md](./HANDOFF.md) にまとまっています。

## 構成

| ディレクトリ | 役割 | 外部依存 |
|---|---|---|
| [`music-mcp/`](./music-mcp) | BGM生成（作曲 → MIDI → SoundFontでレンダリング） | fluidsynth（CLI）＋ SoundFont(.sf2) |
| [`game-sfx-mcp/`](./game-sfx-mcp) | SE生成（波形合成で直接WAVを生成） | なし |

それぞれ独立したMCPサーバーです。ツール一覧やパラメータの詳細は各ディレクトリのREADMEを参照してください。

## 2つの利用形態

どちらもツールの中身（音楽理論・DSP・MIDI/WAV生成ロジック）は完全に共通です。stdio版とHTTP版は入出力の経路が違うだけで、同じ`createMcpServer()`を使っています。

1. **MCPサーバーとして導入**（ローカル）— Claude CodeなどのMCPクライアントにローカルプロセス（stdio）として登録し、AIがツール呼び出しで直接音楽・SEを生成します
2. **APIとして公開**（HTTP）— MCPのStreamable HTTPトランスポートでサーバーを起動し、リモートのMCPクライアントからネットワーク経由で叩けるようにします

---

## MCPを導入する側の設定

AI（Claude Codeなど）に音楽・SEを生成させたい場合の設定です。以下をコピペするだけで導入できます。

### 前提

- Node.js 18以上
- （BGM生成 = `music-mcp` を使う場合のみ）fluidsynthと無料のGeneral MIDI SoundFont(.sf2)。詳細は [music-mcp/README.md](./music-mcp/README.md#2-fluidsynthのインストール音を鳴らすのに必要) を参照

### 1. clone & ビルド

```bash
git clone <このリポジトリのURL>
cd music-composer-mcp
(cd music-mcp && npm install && npm run build)
(cd game-sfx-mcp && npm install && npm run build)
```

### 2. Claude Codeへの登録

BGM生成用（`music-mcp`）とSE生成用（`game-sfx-mcp`）は別々のMCPサーバーとして登録します。片方だけ必要な場合はそちらのコマンドだけ実行してください。

```bash
claude mcp add music-composer -- node "$(pwd)/music-mcp/dist/index.js"
claude mcp add game-sfx -- node "$(pwd)/game-sfx-mcp/dist/index.js"
```

> PowerShellの場合は `"$(pwd)"` を `"$PWD"` に読み替えてください。

### 3. 接続確認

```bash
claude mcp list
```

`music-composer` と `game-sfx` が両方 `✔ Connected` になっていれば導入完了です。

### 4. 使ってみる

Claude Codeのセッション内で自然言語で頼むだけです。

```
game-sfxを使って、コイン取得音を3パターン作って聴き比べたい。
```

```
music-composerを使って、Cメジャーのコード進行(C→G→Am→F)を4小節、テンポ100で作って。
```

ツールの詳細な一覧・パラメータは [music-mcp/README.md](./music-mcp/README.md) と [game-sfx-mcp/README.md](./game-sfx-mcp/README.md) を参照してください。

---

## APIサーバ側の設定

各サーバーをHTTP（MCP Streamable HTTPトランスポート）で起動し、ネットワーク越しにリモートMCPクライアントから利用できます。エンドポイントはそれぞれ1つ（`/mcp`）です。**このリポジトリをホストするマシン/VPS/コンテナ上で以下を実行するだけ**で起動します。

### 1. clone & ビルド

```bash
git clone <このリポジトリのURL>
cd music-composer-mcp
(cd music-mcp && npm install && npm run build)
(cd game-sfx-mcp && npm install && npm run build)
```

### 2. 起動

`API_KEY`を設定すると、全リクエストに`Authorization: Bearer <API_KEY>`ヘッダーが必須になります。**外部（インターネット）に公開する場合は必ず設定してください**（未設定だと誰でも呼び出せてしまいます）。

```bash
# BGM API（デフォルトポート 8788）
(cd music-mcp && PORT=8788 API_KEY=好きな秘密文字列 npm run start:http)

# SE API（デフォルトポート 8787）
(cd game-sfx-mcp && PORT=8787 API_KEY=好きな秘密文字列 npm run start:http)
```

> Windows PowerShellの場合は `PORT=8788 API_KEY=xxx npm run start:http` の代わりに `$env:PORT=8788; $env:API_KEY="xxx"; npm run start:http` を使ってください。

起動すると以下でMCPクライアントから接続できます。

| API | エンドポイント |
|---|---|
| BGM生成（music-mcp） | `http://<ホスト>:8788/mcp` |
| SE生成（game-sfx-mcp） | `http://<ホスト>:8787/mcp` |

### 3. 疎通確認

```bash
curl -i -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer 好きな秘密文字列" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl-test","version":"0.0.1"}}}'
```

`serverInfo`が返ってHTTPステータスが200であれば正常です（レスポンスの`mcp-session-id`ヘッダーを使って以降のリクエストを続けます）。

### 特性・制約

- **認証**: `API_KEY`環境変数によるBearerトークンのみ（未設定時は無認証）。それ以上の認証基盤（OAuth等）は現状未実装
- **状態管理**: プロジェクト状態（`music-mcp`の作曲中データ）はプロセス全体で1つを共有するシングルトン設計です。全クライアントが同じ「現在のプロジェクト」を触るため、個人利用・単一クライアント向けです
- **音声データの受け渡し**: 生成したWAV/MIDIは、ローカルファイル書き込み（ベストエフォート）に加えて、常にbase64（MCPの`audio`コンテンツ）としてもレスポンスに含まれます。共有ファイルシステムがないリモート環境でもそのまま音声を受け取れます
- **`music-mcp`の`render_audio`**: fluidsynthとSoundFont(.sf2)が**サーバーを動かしているホスト側**に必要です（呼び出し側のマシンではありません）

### 今後の計画

現在は自前ホスト（VPS・コンテナ等）向けのHTTPサーバーとして実装しています。Cloudflare Workers等のサーバーレス環境へのデプロイ（0円運用）は今後の検討事項です。詳細な技術的制約・方針は [HANDOFF.md 第4章](./HANDOFF.md) を参照してください。

| パッケージ | サーバーレス化の難易度 | 方針 |
|---|---|---|
| `game-sfx-mcp` | 低い（外部依存なし・計算のみで完結） | Cloudflare Workers（Agents SDKの`McpAgent`）でほぼそのまま移植可能な見込み |
| `music-mcp` | 高い（fluidsynthバイナリに依存） | Workers上では外部プロセスを起動できないため、①MIDI生成部分のみ公開 ②fluidsynthをWASM化 ③Cloudflare Containersを使う、のいずれかを検討中 |

進捗・TODOは [HANDOFF.md「5. 次のアクション」](./HANDOFF.md) を参照してください。

---

## ライセンス

各パッケージの `package.json` に準拠（現状 ISC）。

## 詳細ドキュメント

- [music-mcp/README.md](./music-mcp/README.md) — BGM生成MCPサーバーの詳細（ツール一覧、設計メモ、拡張候補）
- [game-sfx-mcp/README.md](./game-sfx-mcp/README.md) — SE生成MCPサーバーの詳細（ツール一覧、DSP設計、拡張候補）
- [HANDOFF.md](./HANDOFF.md) — 開発経緯・設計判断・API公開の詳細方針
