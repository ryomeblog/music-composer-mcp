# game-sfx-mcp

ゲーム用の効果音（SE）をAI（Claude Code）に生成させる自作MCPサーバーです。
sfxr系のような既存ライブラリには依存せず、波形生成・エンベロープ・フィルターを含む
DSP（音声合成）を丸ごと自前で実装し、44.1kHz/16bit monoのWAVを直接書き出します。

## できること（MCPツール一覧）

| ツール | 内容 |
|---|---|
| `list_presets` | 用意されているプリセットカテゴリ一覧を取得 |
| `generate_preset` | プリセット（pickup/laser/explosion/powerup/hit/jump/select/alert）からWAVを生成。使われたパラメータも返る |
| `randomize_sfx` | カテゴリに縛られないランダム音を生成（sfxrの「ランダム」ボタン相当） |
| `synthesize_sfx` | 波形・ピッチ変化・エンベロープ・ビブラート・フィルター等を全部指定してWAVを生成 |

## 音声合成エンジンの設計

- **波形**: square / sawtooth / triangle / sine / noise（ホワイトノイズ）
- **ピッチエンベロープ**: 開始Hz→終了Hzを指数 or 線形で変化。ビブラート、アルペジオ（曲の途中でピッチが跳ぶ8bit的効果）にも対応
- **音量エンベロープ**: attack/sustain/decay（秒指定）＋ punch（立ち上がりの一撃を強調）
- **フィルター**: ローパス/ハイパス（一次IIR、自前実装）
- **ノイズブレンド**: 通常波形にホワイトノイズを混ぜて「衝突音」っぽい質感を追加
- **repeatCount**: エンベロープごと繰り返して連続ビープ音（alertプリセット等）を作成

すべてHz・秒・0-1という実単位で指定できるようにしており、sfxrの0-1正規化パラメータより
AIが値を組み立てやすい設計にしています。

## セットアップ

```bash
cd game-sfx-mcp
npm install
npm run build
```

Node.js 18以上が必要です。fluidsynthやSoundFontは**不要**です（このサーバーは音源ファイルに
依存せず、波形をコードで直接生成します）。

### Claude Codeに登録

```bash
claude mcp add game-sfx -- node /絶対パス/game-sfx-mcp/dist/index.js
```

```bash
claude mcp list
```

`game-sfx` が `✔ Connected` になっていればOKです。

## HTTPで公開する（リモートAPIとして使う）

Claude Codeなどからstdioで直接使う以外に、MCPのStreamable HTTPトランスポートでHTTP APIとして起動することもできます。エンドポイントは1つ（`/mcp`）で、リモートのMCPクライアントから接続できます。外部依存もファイル永続化も不要なので、そのままリモートホストにデプロイしやすい構成です。

```bash
npm run build
PORT=8787 API_KEY=好きな秘密文字列 npm run start:http
```

- `PORT`: 待受ポート（省略時 `8787`）
- `API_KEY`: 設定すると全リクエストに `Authorization: Bearer <API_KEY>` が必須になります。**外部に公開する場合は必ず設定してください**（未設定だと誰でも呼び出せます）
- 接続先: `http://<ホスト>:<PORT>/mcp`（MCPクライアント側でStreamable HTTPのURLとしてこれを指定）

各生成系ツールはファイルパスに加えて、生成したWAVのバイト列をbase64（MCPの`audio`コンテンツ）でもレスポンスに含めます。共有ファイルシステムがない環境（コンテナ・サーバーレス等）にデプロイした場合はファイル書き込み自体がベストエフォート（失敗しても無視）になり、base64側のデータだけが返ります。

## 使い方の例

```
game-sfxを使って、コイン取得音を3パターン作って聴き比べたい。
```

```
爆発音がもっと低くて長く尾を引く感じにしたい。generate_presetで出たパラメータを
ベースに、synthesize_sfxでdecayを伸ばしてlowPassFreqをもっと下げて調整して。
```

生成されたWAVは `output/` に保存されます。Godotのプロジェクトの `res://assets/sfx/` などに
そのままインポートできます（Godotは.wavを直接サポート）。

## 動作確認済みの内容

- 全プリセット・ランダム・カスタム生成をエンドツーエンドでテスト済み
- 生成したWAVをPython(`wave`モジュール)で独立にパースし、フォーマット（44100Hz/mono/16bit）が
  正しいことを確認
- `synthesize_sfx`でsine波を440Hz→880Hzに指数スイープさせた音を、FFTで前半/後半の支配的周波数を
  測定し、実際にピッチが上昇していることを確認
- `explosion`プリセットのスペクトルを解析し、単一トーンではなく broadband（多数の周波数帯にエネル
  ギーが分布）なノイズになっていることを確認

## 今後の拡張候補

- ピッチが付いた周期ノイズ（NESのノイズチャンネルのような質感）
- ステレオ化・パンニング
- ループ可能なアンビエント系SEの生成（環境音ループ）
- WAV以外のOGG出力（Godotのストリーミング再生向け）
