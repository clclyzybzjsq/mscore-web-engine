# mscore-web-engine

Self-hosted MuseScore 4.x WebAssembly engine — load, edit, play and save
scores entirely in the browser. This is the independent open-source
distribution of the engine used by the score-collab plugin.

> **Language**: 本文件为英文主版，关键章节附中文说明。中文完整版见 docs/README.zh-CN.md。

## What this is

- A complete **MuseScore Studio 4.7.4** WebAssembly build (QML UI included),
  ~82 MB wasm + ~5 MB audio engine + ~51 MB soundfont.
- A tiny **embedding API** (`src/index.js`) and a generic **viewer page**
  (`engine/viewer.html`) that talk over `postMessage`, so you can drop the
  engine into any web page — no framework, no build step, no backend.
- A **static demo** (`examples/demo/`) that opens, plays and saves scores.

```
mscore-web-engine/
├── engine/                  # the shipped engine (wasm + js + distr + sound)
│   ├── viewer.html          # generic host page (postMessage protocol)
│   ├── MuseScoreStudio.wasm # main engine, QML UI embedded (~82 MB)
│   ├── MuseAudio.js         # audio engine (worklet) (~5 MB)
│   ├── distr/               # loader + audio driver glue
│   └── sound/MS Basic.sf3   # default soundfont, MIT (~51 MB)
├── src/index.js             # MuseScoreWeb embedding API (ESM, zero deps)
├── examples/demo/           # standalone demo page
├── scripts/
│   ├── serve.mjs            # dev static server (Range + wasm MIME)
│   ├── build.mjs            # assemble dist/ directory
│   ├── check-assets.mjs     # verify engine assets are complete
│   ├── build-wasm.sh        # rebuild the engine from source (git-bash)
│   └── qmltype-patch.py     # Qt 6.7 qmltyperegistrar patch (automated)
├── docs/BUILDING.md         # reproducible build + full patch list
├── NOTICE                   # third-party licenses & attributions
└── LICENSE                  # GPL-3.0-only
```

## Quick start

```sh
node scripts/check-assets.mjs   # sanity-check the engine files (optional)
node scripts/serve.mjs 8000      # start the dev server
```

Then open <http://127.0.0.1:8000/examples/demo/>.

Click **Open score file** to load a `.mscz` / `.mscx` / `.musicxml`, **Play**
to start audio (must follow a user gesture), **Save .mscz** to download the
current score.

## Embedding

```html
<div id="host" style="position:relative;height:80vh"></div>
<script type="module">
  import { MuseScoreWeb } from './src/index.js';

  const mscore = new MuseScoreWeb({
    container: document.getElementById('host'),
    engineUrl: 'engine/viewer.html',        // path to the shipped viewer
    onReady:  (v) => console.log('engine ready', v),
    onSaved:  (p) => { /* p.data is a Uint8Array of the saved .mscz */ },
    onError:  (e) => console.error(e),
  });
  mscore.mount();

  // Load a score from raw bytes:
  const bytes = await fetch('/scores/example.mscz').then(r => r.arrayBuffer());
  await mscore.load({ name: 'example', data: new Uint8Array(bytes) });
</script>
```

### API

| Method | Description |
|---|---|
| `new MuseScoreWeb({ container, engineUrl, onReady, onSaved, onScoreLoaded, onError, onLog })` | create a wrapper |
| `mount()` | insert the engine iframe into `container` |
| `destroy()` | remove iframe and listeners |
| `load({ name, data })` | load a score from `Uint8Array` bytes |
| `save()` | ask the engine to save; result arrives via `onSaved` |
| `play()` | start audio (call from a user gesture) |

### postMessage protocol

`engine/viewer.html` can also be embedded directly (no wrapper). The protocol:

- host → engine: `{ source: 'mscore-web-engine-host', type: 'load-score' | 'save-score', payload }`
- engine → host: `{ source: 'mscore-web-engine', type: 'ready' | 'score-loaded' | 'saved' | 'error' | 'log', payload }`

`saved.payload.data` carries the saved `.mscz` as a `Uint8Array`.

## Serving requirements

- **Range requests** — the 82 MB wasm and 51 MB soundfont are fetched with
  HTTP Range (the official glue does this). Any static server that supports
  Range works; `scripts/serve.mjs` does.
- **`application/wasm` MIME** for `.wasm` (needed for streaming
  instantiation).
- **URL-encoded filenames** — the default soundfont path is
  `sound/MS%20Basic.sf3`.

## Playback

Playback uses the bundled audio engine (`MuseAudio.js`) running inside an
AudioWorklet (config `MUSE_MODULE_AUDIO_WORKER: 'OFF'`). Browsers require a
**user gesture** before audio starts; the viewer installs a one-shot click
listener that calls `startAudioProcessing`. The engine loads the soundfont
(`MS Basic.sf3`) through the audio RPC once the driver is up.

If audio setup fails (e.g. the audio wasm is missing), the engine still runs;
playback is simply disabled and an error is logged.

## Customizing

### Soundfont

Serve your own `.sf3` and pass its URL:

```js
// low-level: pass to createMuApi()
const muapi = await createMuApi({ screen, soundFont: '/my/sound.sf3', ... });
```

The wrapper does not expose this yet; edit `engine/distr/muapi.js`
(`DEFAULT_SOUNDFONT`) or pass `soundFont` in the viewer's `createMuApi` call.

### Engine assets

Replace the files under `engine/` with your own build. `scripts/build-wasm.sh`
rebuilds from source; see `docs/BUILDING.md` for the exact toolchain and the
17-item patch list.

### Default score / templates

The score-collab plugin ships blank templates as `.mscx`; this project does
not bundle them — load any score via `load()` or the demo's file picker.

## Building from source

See [docs/BUILDING.md](docs/BUILDING.md) — complete reproducible build
record (MuseScore 4.7.4 + Qt 6.7.3 + emsdk 3.1.50), including the full patch
list with `[required]`/`[recommended]` markers and a troubleshooting index.

## License

**GPL-3.0-only** (this project). The bundled engine (MuseScore Studio),
Qt runtime, and audio engine keep their own licenses — see `NOTICE` for the
full component-by-component list, including the MIT-licensed soundfont
attribution. Source availability and rebuild instructions are in
`docs/BUILDING.md`.

---

## 中文快速说明

`mscore-web-engine` 是从 score-collab 插件中独立出来的开源 Web 版
MuseScore 引擎：加载 / 编辑 / 播放 / 保存乐谱全部在浏览器内完成，无需后端。

- **快速体验**：`node scripts/serve.mjs 8000` 后打开
  `http://127.0.0.1:8000/examples/demo/`，用「Open score file」打开
  `.mscz/.mscx/.musicxml`，点 Play 播放，点 Save 下载保存。
- **嵌入**：`import { MuseScoreWeb } from './src/index.js'`，
  `new MuseScoreWeb({ container, engineUrl })` + `mount()` 即可；
  底层是 `postMessage` 协议（见上）。
- **引擎**：`engine/` 下是完整产物（wasm 82MB + 音频引擎 5MB +
  音源 51MB）；换自己的构建只需替换该目录，或按
  `docs/BUILDING.md` 从源码重编。
- **许可**：项目 GPL-3.0；内嵌 MuseScore / Qt / 音频引擎各自保持原许可，
  音源为 MIT —— 详见 `NOTICE`。
