# ゲーム音楽・SE生成 MCPサーバー群 — 引き継ぎメモ

このファイルは、Claude（chat）との検討を踏まえてClaude Codeに開発を引き継ぐための資料です。
配布された2つのzip（`music-composer-mcp.zip` / `game-sfx-mcp.zip`）の使い分けと、
ここまでの経緯・設計判断・今後の方針をまとめています。

---

## 1. 背景・経緯

1. きっかけは「Reason Free（DAW）をMCP化してAI操作できないか」という相談だった
2. 調査の結果、Reason（Free版含む）には公式の外部制御API（REST/OSC/WebSocket）が存在せず、
   状態の読み取りもほぼ不可能なため、直接のMCP化は困難と判断
3. 方針転換：「音楽生成アプリ自体を自作し、それをMCP化する」方向に切り替え
4. 用途を確認したところ「**ゲームのBGMやSE音の生成に使う**」ことが判明
5. BGMとSEは音の作り方が根本的に別物（BGM=音階のある作曲、SE=ノイズ/スイープ中心の一撃音）
   なので、**2つのMCPサーバーとして別々に開発**することにした
6. 開発中に既存のGitHub上の類似プロジェクトも調査し、参考にしつつも
   **外部ライブラリに依存せず自前実装する方針**（自作）を選んだ
7. 動くところまで実装・テストを完了し、GitHub公開とClaude Codeへの開発引き継ぎ、
   さらに「APIで公開したい（リモートMCPサーバー化）」という話に発展した

---

## 2. 成果物：2つのZIPの使い分け

### `music-composer-mcp.zip` — BGM（曲）生成用

- **役割**: 音階のある曲（メロディ・コード進行）をMIDIとして組み立て、SoundFontで実際の音にレンダリングする
- **ツール**: `set_tempo` / `set_time_signature` / `add_track` / `list_tracks` / `remove_track` /
  `add_notes` / `clear_notes` / `get_project` / `reset_project` / `list_gm_instruments` /
  `export_midi` / `render_audio` / `save_project` / `load_project`
- **実装方針**: MIDIファイルの書き出しは既存ライブラリ（midi-writer-js等）を使わず、
  Standard MIDI File形式を自前のバイナリライター（`src/midi-writer.ts`）で実装
- **外部依存**:
  - **fluidsynth**（CLIバイナリ、要インストール）— `render_audio`がこれをサブプロセスとして呼び出す
  - **SoundFont(.sf2)ファイル**（ユーザー側で別途用意、無料のGeneral MIDI SoundFontを想定）
- **動作確認済みの内容**: サーバー起動→MCPクライアントからのツール呼び出し→ノート追加→
  MIDI書き出しまでを実機確認。書き出した`.mid`をPythonの`mido`ライブラリで独立にパースし、
  テンポ・ノートオン/オフのタイミングが正しいことを確認済み（fluidsynthでの実レンダリングは
  バイナリが無い検証環境のため未実施）

### `game-sfx-mcp.zip` — SE（効果音）生成用

- **役割**: コイン取得音・爆発音・ジャンプ音など、ゲームの短い効果音を波形合成で直接生成する
- **ツール**: `list_presets` / `generate_preset`（pickup/laser/explosion/powerup/hit/jump/select/alert）/
  `randomize_sfx` / `synthesize_sfx`（フルパラメータ指定）
- **実装方針**: sfxr系の既存ライブラリには依存せず、オシレーター（square/sawtooth/triangle/sine/noise）、
  ADSR的エンベロープ、ピッチスイープ、ビブラート、アルペジオ、一次IIRフィルター（ローパス/ハイパス）、
  WAVエンコードまで**すべて自前実装**（`src/synth.ts` / `src/wav-writer.ts`）
- **パラメータ設計**: sfxrの0-1正規化パラメータではなく、Hz・秒という実単位で指定できるように
  独自設計（AIが値を組み立てやすくするため）
- **外部依存**: **なし**（純粋な計算のみ、外部バイナリもファイルも不要）
- **動作確認済みの内容**: 全プリセット＋ランダム＋カスタム波形をMCPクライアント経由で実際に生成。
  Pythonで独立にWAVをパースしフォーマット確認。FFTで前半/後半の支配周波数を測定し、
  sine波のピッチスイープ（440→880Hz）が実際に上昇していることを確認。explosionプリセットの
  スペクトルがbroadband（単一トーンでない）ノイズになっていることも確認済み

### なぜ2つに分けたか（技術的な理由）

「音の作り方」の違いに加えて、**依存関係が根本的に違う**ことが分割の実質的な理由：

| | music-composer-mcp | game-sfx-mcp |
|---|---|---|
| 外部依存 | fluidsynthバイナリ＋.sf2ファイル | なし |
| 出力経路 | .midを書き出し→外部プロセス呼び出し | メモリ上の計算のみで完結 |

この違いが、後述するAPI公開（Cloudflare Workers化）の可否に直結する（3章参照）。
分割は絶対の技術要件ではなく、1つのMCPサーバーに統合すること自体は可能。

---

## 3. GitHub公開・Claude Codeへの引き継ぎ手順

1. 各zipをローカルに解凍
2. リポジトリ構成：2つは独立したMCPサーバーなので別リポジトリが基本だが、
   1人でまとめて管理するならmonorepo（1リポジトリにサブフォルダとして両方）でも可
3. 各プロジェクトのフォルダで
   ```bash
   git init && git add . && git commit -m "Initial commit"
   ```
4. GitHubで空リポジトリを作成し、`git remote add origin ...` → `git push`
   （ライセンスはMITを想定。他の類似MCPサーバーもMITが多い）
5. リポジトリのフォルダで `claude` を起動 → `/init` でCLAUDE.mdを自動生成
   - `/init`はコードとREADMEから機械的に生成するため、
     「既存ライブラリに依存しない自作方針」など、経緯としての設計判断までは拾いきれない可能性がある。
     生成後に本ファイル（HANDOFF.md）の内容を踏まえて補記するとよい
6. README.mdの「今後の拡張候補」セクションから次の作業を選んで着手

---

## 4. API公開（リモートMCPサーバー化）の方針と制約

「APIで公開したい」＝ローカルのstdioサーバーではなく、**HTTPでリモート接続できるMCPサーバー**にして
Claude APIやその他のMCPクライアントから使えるようにしたい、という要望。

- ユーザーは別プロジェクト（カードゲーム開発）でCloudflareをバックエンドに使っており、0円運用方針があるため、
  **Cloudflare Workers**（Agents SDKの`McpAgent`クラス、Streamable HTTP transport、
  無料枠1日10万リクエスト、`wrangler deploy`で数分デプロイ）が第一候補
- **重大な制約**: Cloudflare Workersは外部プロセスの起動（`child_process.spawn`）ができず、
  永続的なファイルシステムも持たない

この制約により、2つのプロジェクトでAPI化の難易度が大きく異なる：

- **game-sfx-mcp**: 純粋な計算のみなので、ほぼそのままWorkers化できる。
  唯一の変更点は「`output/`にWAVを書き出してパスを返す」を
  「WAVのバイト列をbase64でレスポンスに直接含める」に変更するだけ
- **music-composer-mcp**: `render_audio`がfluidsynthバイナリを呼んでいるため、
  そのままではWorkers上で動かない。選択肢：
  1. MIDI生成部分（`export_midi`等）だけWorkersで公開し、音声レンダリングは対象外にする
  2. fluidsynthをWASM版のシンセサイザーに置き換える（Workersはビルド済みWASMの実行は可能）
  3. Cloudflare Containers（Workersとは別の実Linuxコンテナを動かせる有料プロダクト）を使う

### 推奨する進め方

1. まず **game-sfx-mcpをCloudflare Workersのremote MCPサーバーとして先に公開**する
   （出力をbase64返却に変更するだけで済むため着手しやすい）
2. music-composer-mcpは当面ローカル（Claude Code経由のstdio）で運用し、
   レンダリング方式の置き換え（WASM化 or Containers化）は別途腰を据えて検討する

---

## 5. 次のアクション（TODO）

- [ ] 2つのzipをGitHubにpush、Claude Codeで`/init`
- [ ] game-sfx-mcp: 出力をファイルパスではなくbase64直接返却に変更（Workers対応の下準備）
- [ ] game-sfx-mcp: Cloudflare Workers（Agents SDK `McpAgent`）向けのエントリポイントを追加し、
      `wrangler deploy`で公開
- [ ] music-composer-mcp: fluidsynth依存の扱い（WASM化 or Containers化 or ローカル運用継続）を検討
- [ ] 両プロジェクトに動作確認用のテストスクリプト（本チャットで使ったMCPクライアント経由の検証手法）を
      正式に追加する
- [ ] （余力があれば）Anthropic公式のMCPディレクトリや`awesome-mcp-servers`系リストへの掲載を検討
