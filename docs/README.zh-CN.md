# mscore-web-engine（中文文档）

自托管 MuseScore 4.x WebAssembly 引擎——在浏览器里加载、编辑、播放、保存乐谱。
这是 score-collab 插件所用引擎的独立开源发行版。

## 这是什么

- 完整 **MuseScore Studio 4.7.4** WebAssembly 构建（含 QML 界面），
  wasm ≈82MB + 音频引擎 ≈5MB + 音源 ≈51MB。
- 极简**嵌入 API**（`src/index.js`）与通用**宿主页**（`engine/viewer.html`），
  二者通过 `postMessage` 通信——任何网页可直接嵌入，无需框架/构建/后端。
- 静态**示例**（`examples/demo/`）：打开、播放、保存乐谱。

```
mscore-web-engine/
├── engine/                  # 引擎产物（wasm + js + distr + sound）
│   ├── viewer.html          # 通用宿主页（postMessage 协议）
│   ├── MuseScoreStudio.wasm # 主引擎，QML 界面内嵌（≈82MB）
│   ├── MuseAudio.js         # 音频引擎（worklet）（≈5MB）
│   ├── distr/               # 加载器 + 音频驱动胶水
│   └── sound/MS Basic.sf3   # 默认音源，MIT（≈51MB）
├── src/index.js             # MuseScoreWeb 嵌入 API（ESM，零依赖）
├── examples/demo/           # 独立示例页
├── scripts/
│   ├── serve.mjs            # 开发静态服务器（Range + wasm MIME）
│   ├── build.mjs            # 组装 dist/ 目录
│   ├── check-assets.mjs     # 校验引擎资产完整性
│   ├── smoke.mjs            # HTTP 冒烟测试
│   ├── build-wasm.sh        # 从源码重建引擎（git-bash）
│   └── qmltype-patch.py     # Qt 6.7 qmltyperegistrar 补丁（自动化）
├── docs/BUILDING.md         # 可复现构建 + 完整补丁清单
├── NOTICE                   # 第三方许可与归属
└── LICENSE                  # GPL-3.0-only
```

## 快速开始

```sh
node scripts/check-assets.mjs   # 校验引擎文件（可选）
node scripts/serve.mjs 8000      # 启动开发服务器
```

打开 <http://127.0.0.1:8000/examples/demo/>。

点 **Open score file** 加载 `.mscz` / `.mscx` / `.musicxml`，**Play** 开始播放
（必须在用户手势后），**Save .mscz** 下载当前乐谱。

## 嵌入

```html
<div id="host" style="position:relative;height:80vh"></div>
<script type="module">
  import { MuseScoreWeb } from './src/index.js';

  const mscore = new MuseScoreWeb({
    container: document.getElementById('host'),
    engineUrl: 'engine/viewer.html',        // 指向发布的 viewer
    onReady:  (v) => console.log('engine ready', v),
    onSaved:  (p) => { /* p.data 是保存后的 .mscz Uint8Array */ },
    onError:  (e) => console.error(e),
  });
  mscore.mount();

  // 从字节加载乐谱：
  const bytes = await fetch('/scores/example.mscz').then(r => r.arrayBuffer());
  await mscore.load({ name: 'example', data: new Uint8Array(bytes) });
</script>
```

### API

| 方法 | 说明 |
|---|---|
| `new MuseScoreWeb({ container, engineUrl, onReady, onSaved, onScoreLoaded, onError, onLog })` | 创建包装器 |
| `mount()` | 把引擎 iframe 插入 `container` |
| `destroy()` | 移除 iframe 与监听器 |
| `load({ name, data })` | 从 `Uint8Array` 字节加载乐谱 |
| `save()` | 请求引擎保存；结果经 `onSaved` 返回 |
| `play()` | 开始播放（须在用户手势中调用） |

### postMessage 协议

`engine/viewer.html` 也可直接嵌入（不用包装器）。协议：

- 宿主 → 引擎：`{ source: 'mscore-web-engine-host', type: 'load-score' | 'save-score', payload }`
- 引擎 → 宿主：`{ source: 'mscore-web-engine', type: 'ready' | 'score-loaded' | 'saved' | 'error' | 'log', payload }`

`saved.payload.data` 携带保存的 `.mscz`（`Uint8Array`）。

## 服务器要求

- **Range 请求**——82MB wasm 与 51MB 音源用 HTTP Range 拉取（官方胶水如此）；
  支持 Range 的任意静态服务器均可，`scripts/serve.mjs` 已支持。
- **`application/wasm` MIME**（流式实例化需要）。
- **URL 编码文件名**——默认音源路径为 `sound/MS%20Basic.sf3`。

## 播放

播放使用随包音频引擎（`MuseAudio.js`），运行在 AudioWorklet 内
（配置 `MUSE_MODULE_AUDIO_WORKER: 'OFF'`）。浏览器要求**用户手势**后才允许
音频启动；viewer 安装了单击一次性监听器调用 `startAudioProcessing`。驱动就绪后
引擎经音频 RPC 加载音源（`MS Basic.sf3`）。

若音频初始化失败（如音频 wasm 缺失），引擎仍可运行，只是播放被禁用并记录错误。

## 自定义

### 换音源

提供自己的 `.sf3` 并传入 URL：

```js
// 底层：传给 createMuApi()
const muapi = await createMuApi({ screen, soundFont: '/my/sound.sf3', ... });
```

包装器暂未暴露此选项；可改 `engine/distr/muapi.js`（`DEFAULT_SOUNDFONT`），
或在 viewer 的 `createMuApi` 调用中传 `soundFont`。

### 换引擎产物

用你自己的构建替换 `engine/` 下文件。`scripts/build-wasm.sh` 从源码重建；
工具链与 17 项补丁清单见 `docs/BUILDING.md`。

### 默认乐谱 / 模板

score-collab 插件自带空模板 `.mscx`；本项目不打包它们——用 `load()` 或
示例的文件选择器加载任意乐谱即可。

## 从源码构建

见 [docs/BUILDING.md](BUILDING.md)——完整可复现构建记录
（MuseScore 4.7.4 + Qt 6.7.3 + emsdk 3.1.50），含 `[required]`/`[recommended]`
标记的补丁清单与故障排查索引。

## 许可

**GPL-3.0-only**（本项目）。内嵌引擎（MuseScore Studio）、Qt 运行时、音频引擎
各自保持原许可——完整逐组件清单见 `NOTICE`（含 MIT 音源的归属要求）。
源码可用性与重建说明见 `docs/BUILDING.md`。
