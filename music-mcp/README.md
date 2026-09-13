# music-composer-mcp

AI（Claude Code）から音楽を作曲・レンダリングできるようにする自作MCPサーバーです。
MIDIデータの組み立てはこのサーバーが直接（外部ライブラリに頼らず）行い、実際の音への変換は
無料の**SoundFont（.sf2）＋fluidsynth**を使います。

## できること（MCPツール一覧）

| ツール | 内容 |
|---|---|
| `set_tempo` | テンポ(BPM)を設定 |
| `set_time_signature` | 拍子を設定（4/4など） |
| `add_track` | トラックを追加（General MIDI音色を指定） |
| `list_tracks` | トラック一覧を取得 |
| `remove_track` | トラックを削除 |
| `add_notes` | トラックに音符を追加（音名 "C4" or MIDI番号どちらもOK） |
| `clear_notes` | トラックの音符を全消去 |
| `get_project` | **現在の曲の状態を丸ごとJSONで取得**（Reasonにはできなかった「読み取り」） |
| `reset_project` | 新規プロジェクトにリセット |
| `list_gm_instruments` | General MIDI 128音色の一覧を取得 |
| `export_midi` | .midファイルを書き出し |
| `render_audio` | fluidsynthでWAVにレンダリング |
| `save_project` / `load_project` | プロジェクトをJSONで保存/読込 |

## セットアップ

### 1. 依存関係のインストール

```bash
cd music-composer-mcp
npm install
npm run build
```

Node.js 18以上が必要です。

### 2. fluidsynthのインストール（音を鳴らすのに必要）

- **macOS**: `brew install fluid-synth`
- **Ubuntu/Debian**: `sudo apt install fluidsynth`
- **Windows**: [fluidsynthのGitHub Releases](https://github.com/FluidSynth/fluidsynth/releases) からダウンロードしてPATHに追加

### 3. 無料のSoundFont（.sf2）を用意

`FluidR3_GM.sf2`など、無料で配布されているGeneral MIDI SoundFontを検索してダウンロードし、
分かりやすい場所に置いてください（`render_audio`ツールにパスを渡します）。

### 4. Claude Codeに登録

プロジェクトのあるディレクトリで：

```bash
claude mcp add music-composer -- node /絶対パス/music-composer-mcp/dist/index.js
```

接続確認：

```bash
claude mcp list
```

`music-composer` が `✔ Connected` になっていればOKです。

## 使い方の例

Claude Codeのセッション内でこんな風に頼むだけです：

```
music-composerを使って、Cメジャーのシンプルなピアノのコード進行(C→G→Am→F)を
4小節、テンポ100で作って、WAVに書き出して。SoundFontは ~/soundfonts/FluidR3_GM.sf2 にある。
```

Claude Codeが `add_track` → `add_notes` → `render_audio` のように自動でツールを呼び出して
作曲・書き出しまで行います。書き出したWAVはClaude Code自身のbashツールで再生できます
（例: macOSなら `afplay output/render.wav`）。

## 設計メモ

- ノート数値: MIDIノート番号(0-127) または `C4`(=60, 中央のド) のような音名文字列のどちらでも指定可能
- 現在は単一プロジェクトをサーバーのメモリ上に保持する設計（`save_project`/`load_project` で永続化可能）
- 出力ファイルはすべて実行ディレクトリ配下の `output/` に書き出されます
- MIDI書き出しは自前のSMF(Standard MIDI File)ライターで実装しており、`mido`(Python)で
  パースできることを確認済みです

## 今後の拡張候補

- ドラムパターン専用のヘルパーツール（GM channel 10 / 標準ドラムマップ対応）
- コード名からノートを自動生成するツール（"Cmaj7"→ノート配列）
- 和音・スケールのバリデーション
- 本格シンセ路線に進みたくなったら、Web Audio API/Toneベースのオシレーター・フィルター・
  エンベロープをここに追加していく拡張も可能
