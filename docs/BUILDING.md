# Building the WASM engine from source

This document is the reproducible build record for `engine/` — the MuseScore
4.7.4 WebAssembly build that ships with mscore-web-engine. Every local patch
made to get the official source tree to compile for `app-web` with Qt 6.7.3 /
emsdk 3.1.50 is listed below, in the order it must be applied.

## Why these versions

- **MuseScore 4.7.4** — the upstream release this engine tracks. Its official
  wasm recipe (`buildscripts/ci/wasm/`) expects Qt ≥ 6.8, but the Qt online
  repository no longer ships 6.8+/6.10 `wasm` packages (they stop at 6.7.3).
- **Qt 6.7.3 `wasm_singlethread`** — the newest wasm package still available
  (`aqt install-qt linux wasm 6.7.3 wasm_singlethread -m qt5compat qtshadertools`).
- **emsdk 3.1.50** — the exact toolchain Qt 6.7.3 was built with. Newer emsdk
  (e.g. 4.0.7) has an incompatible embind ABI (`_embind_register_function`
  arity 8 vs Qt's 7) that fails at wasm link time.

## Prerequisites (Windows + git-bash)

| Tool | Version / location |
|---|---|
| emsdk | 3.1.50, activated (`emsdk activate` + `source emsdk_env.sh`) |
| Qt | 6.7.3 wasm_singlethread (`$QT_WASM/lib/cmake/Qt6/qt.toolchain.cmake`) |
| Ninja | any recent |
| Python 3 | for `scripts/qmltype-patch.py` |
| git-bash | the script `scripts/build-wasm.sh` is bash, run it from git-bash |
| Source | `MuseScore-4.7.4` tarball from
  https://github.com/musescore/MuseScore/archive/refs/tags/v4.7.4.tar.gz |

> Build directory must sit on a short path. Windows MAX_PATH (260 chars)
> breaks moc output paths (~266 chars) inside the official tree layout; the
> recorded build used `D:/b` as the build root.

## Patch list (apply in order)

Paths are relative to the source tree root (`MuseScore-4.7.4`). Each patch is
marked `[required]` (build fails without it) or `[recommended]` (runtime fix).

### 1. Qt version floor 6.8 → 6.7 — `[required]`

`buildscripts/cmake/SetupQt6.cmake` (L88/L94):

```diff
- find_package(Qt6 6.8 REQUIRED)
+ find_package(Qt6 6.7 REQUIRED)
- REQUIRES 6.8 SUPPORTS_UP_TO 6.10
+ REQUIRES 6.7 SUPPORTS_UP_TO 6.7
```

Backup the original as `.orig-qt68`.

### 2. `appshell`: legacy `declare_module` → `muse_create_module` — `[required]`

`src/appshell` module registration was rewritten to the current
`muse_create_module` API (the old macro is gone in 4.7.4).

### 3. `webinteractive`: pure-virtual interface gaps — `[required]`

`src/web/webinteractive.cpp` — implement the pure virtuals the web build
introduces against the 4.7.4 `IInteractive` interface.

### 4. Qt 6.8-only API guards — `[required]`

- `QFont::PreferTypoLineMetrics` (6.8+) — guard with `#if QT_VERSION >= 0x060800`.
- `QString::fromUcs4(&ucs4, 1)` — 6.7 has no `char32_t` overload; use the
  `uint` overload.
- `QSortFilterProxyModel::beginFilterChange` (6.8+) — 3 call sites guarded
  with `#if QT_VERSION`.

### 5. `QT_NO_PROCESS` guards — `[required]`

Wasm QtCore has `QT_FEATURE_process == -1`; add `#ifndef QT_NO_PROCESS` around
process usage in `src/qmlpluginapi` and `src/engraving/api/v1` (3 sites).

### 6. `WebAudioDriver` trimmed to the 4.7.4 `IAudioDriver` interface — `[required]`

`src/web` audio driver still implemented a pre-4.7 interface: delete 10 stale
methods, change `vector<samples_t>/<sample_rate_t>` signatures, add
`defaultDevice()`.

### 7. `WebSoundFontController`: ContextInject has no default ctor — `[required]`

Inherit `Contextable`, add `channel = { this }`, pass `iocContext` through the
constructor; update the call site in `audiomodule.cpp` (L73).

### 8. Qt 6.7 qmltyperegistrar diffs — `[required]`, automated

Qt 6.7's registrar emits `QMetaType::fromType<Q_NAMESPACE>()` lines that do not
compile (namespaces are not valid QMetaType template args). Run once, before
configuring the build:

```sh
python scripts/qmltype-patch.py <source-root>
```

It drops every `fromType` line that is immediately followed by a
`qmlRegisterNamespaceAndRevisions` call for the same type (the
`staticMetaObject` call is the real registration), and adds the missing
`view/iconcodes.h` / `foreign.h` includes for the ui module.

### 9. `appshell`: remove percussion block — `[required]`

4.7.4 moved percussion panel access to `INotationSceneConfiguration`; the web
`appshell` referenced the wrong interface. Delete the percussion block in
`applicationuiactions.cpp`, the whole `updatePercussionPanelVisibility`
function in `notationpagemodel.cpp`, and the `init`/`drumset` percussion
branches.

### 10. `webapi.h`: five bogus `GlobalInject` — `[required]`

Five non-global interfaces were declared `GlobalInject` (assertion failure at
runtime). Remove the static members and resolve them dynamically in the `.cpp`
files via `webResolve<I>(module)` (`ioc()->resolve`). Also delete the
`resetOnReceive` use (kors async has no such API).

### 11. `main.cpp`: SSL debug logging — `[required]`

`QSslSocket` does not exist in wasm Qt; guard the SSL debug block with
`#if QT_CONFIG(ssl)`.

### 12. embind headers: restore `bind.h` — `[required]`

`webrpcchannel.cpp` / `webaudiochannel.cpp` also contain `EMSCRIPTEN_BINDINGS`
(not just `webinteractive.cpp`) — keep `#include <emscripten/bind.h>` there.
`webapi.cpp` only needs `val.h`.

### 13. `appshell` qrc init: `AUTORCC` — `[required]`

`qInitResources_appshell` undefined → the rewritten `appshell` CMakeLists put
the qrc into `target_sources` but the global mechanism is `qt_add_resources`
(not AUTORCC). Add `set_target_properties(appshell PROPERTIES AUTORCC ON)`.

### 14. wasm-opt unknown `--enable-*` passes — `[required]`

The LLVM `target_features` section contains `+bulk-memory-opt` /
`+call-indirect-overlong`; emscripten's `tools/extract_metadata.py` forwards
them as `--enable-*` to wasm-opt 116, which removed those passes (binaryen 117
removed bulk-memory-opt). Local patch: whitelist `--enable-*` against
`wasm-opt --help`. (Setups: emsdk 3.1.50 ships binaryen 116.)

### 15. Audio engine patches — `[required]`

`src/audioengine/CMakeLists.txt`: add `include(GetPlatformInfo)` (the wasm
build needs `GetPlatformInfo` macros the main tree does not pull in).

Playback deadlock triple fix (RPC-trace located it):
- the worklet `process()` path must not hold the engine scoped_lock across
  `execOperation`;
- the RPC listener must not block the audio thread;
- the `Init`/`addSoundFont` handshake must not race the first `process()`.

### 16. QML load chain fixes — `[required]` for a visible UI

- `StubStyledRectangularShadow.qml` + `QT_QML_SOURCE_TYPENAME` for the shadow
  stub (CMakeLists ordering bug made the property land too late).
- `ArrowScrollButton.qml:24` `FlatButton is not a type` → add the missing
  import (AppMenuBar chain).
- `SetupConfigure.cmake` APP-WEB section: `set(MUE_BUILD_INSPECTOR_QML ON)`
  (the inspector stub qml module is gated off by default).
- `MuseSoundsParams.qml:31`: playback module `internal/` subdir QML lacks
  `import MuseScore.Playback` (web QML needs explicit imports).
- `src/app/internal/guiapp.cpp`: register all QML modules explicitly before
  load (`museRegisterAllQmlModules()`), add `[QMLDBG]` step markers, and use
  `:/qml/Main.qml` for the wasm branch (QML resources embedded in the wasm,
  no external file system).
- `src/app/web/...` `runOnSplashScreen()` stubbed empty; the web appshell
  `Main.qml`/`AppWindow.qml` never restored `window.opacity` from 0.01 (the
  desktop splash path does). Patch `WindowContent.qml:44` to restore
  `window.opacity = 1.0` — without it QtQuick skips the first frame and the
  canvas is never created (blank screen).
- `src/appshell/.../AppMenuBar.qml` (web branch): the delegate uses
  `model.itemRole` while the web model exposes `model.item`, so
  `item.item.subitems` crashes. Use the same accessor as the desktop
  `platform/AppMenuBar.qml`. (QML embedded in qrc — requires a wasm rebuild.)
- Qt side (`qt/6.7.3/wasm_singlethread/lib/cmake/Qt6Qml/Qt6QmlMacros.cmake`):
  wasm-specific macro patch for the static QML module registration under
  Emscripten.

### 17. `distr/` glue — shipped as-is, lightly cleaned

`engine/distr/*` (qtloader, muapi, muimpl, audiodriver, audioworker,
`audio_worklet_processor`, config) come from the web port's `appjs` glue.
The distribution removes the `[rpc-trace]` / `[worklet-trace]` / `STEP` debug
logging that was added while diagnosing the playback deadlock. No functional
change.

## Build

From git-bash:

```sh
bash scripts/build-wasm.sh
# env overrides: JOBS=6, BUILD_DIR=build.release, QT_WASM=/path/to/qt/6.7.3/wasm_singlethread
```

The script configures `cmake -GNinja` with `MUSESCORE_BUILD_CONFIGURATION=app-web`
and runs `ninja`. The finished artifacts land in
`<source>/build.artifacts/` (MuseScoreStudio.wasm / .js / distr / sound).

## Rebuilding the audio engine

`engine/MuseAudio.js` (5.3 MB, SINGLE_FILE with embedded wasm) is built
separately by the upstream audioengine target. The build above produces it into
`build.artifacts/` when `MUSE_MODULE_AUDIO` is enabled (default for app-web).
If only the main engine is rebuilt, keep the existing `MuseAudio.js`.

## Known-good output sizes

| Artifact | Size |
|---|---|
| `engine/MuseScoreStudio.wasm` | 82.2 MB (single file, QML resources embedded) |
| `engine/MuseScoreStudio.js` | 291 KB (MODULARIZE shell) |
| `engine/MuseAudio.js` | 5.3 MB |
| `engine/sound/MS Basic.sf3` | 51.3 MB (added separately; not part of the build) |

## Troubleshooting index (from the recorded build log)

- `moc: Cannot create ... No such file or directory` → build dir path too long
  (MAX_PATH). Move the build root to a short path (`D:/b`).
- wasm-ld `_embind_register_function` arity mismatch → emsdk is newer than
  3.1.50; downgrade.
- `qInitResources_appshell` undefined → missing `AUTORCC ON` (patch 13).
- Blank screen after `onLoaded`: check the opacity restore (patch 16) and the
  `[QMLDBG]` markers in the console.
- No sound: audio must start from a user gesture; the viewer wires a one-shot
  click listener to `startAudioProcessing`.
