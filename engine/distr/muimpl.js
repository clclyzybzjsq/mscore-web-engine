import config from "./config.js";
import qtLoad from "./qtloader.js";
import AudioDriver from "./audiodriver.js";

function setupInternalCallbacks(Module) {

    // Interactive file open dialog (used by the C++ side when the user
    // triggers "Open" from within the Qt application).
    Module.openFileDialog = function(callback) {
        const input = document.createElement('input');
        input.type = 'file';
        input.onchange = (e) => {
            const file = e.target.files[0];
            const fileName = file.name;
            const reader = new FileReader();
            reader.onload = (e) => {
                const contents = e.target.result;
                const uint8View = new Uint8Array(contents);
                callback(fileName, uint8View);
            };
            reader.readAsArrayBuffer(file);
        };
        input.click();
    }
}

function setupRpc(Module)
{
    // Main <= Worker (audio engine): port1 = main side, port2 = worker side.
    Module.main_worker_rpcChannel = new MessageChannel();

    Module.main_worker_rpcSend = function(data) {
        Module.main_worker_rpcChannel.port1.postMessage(data)
    }

    Module.main_worker_rpcListen = function(data) {} // will be overridden

    Module.main_worker_rpcChannel.port1.onmessage = function(event) {
        Module.main_worker_rpcListen(event.data)
    };

    // Worker <= Driver (audio worklet): port1 = driver side, port2 = worker side.
    Module.driver_worker_rpcChannel = new MessageChannel();
}

async function setupDriver(Module)
{
    Module.driver = AudioDriver;

    AudioDriver.onInited = function() {
        if (Module.isNeedStartAudio) {
            Module._startAudioProcessing()
        }

        Module.ccall('addSoundFont', '', ['string'], [Module.soundFont]);
    }

    if (config.MUSE_MODULE_AUDIO_WORKER == "ON") {
        await AudioDriver.setup(Module.config, Module.driver_worker_rpcChannel.port1);
    } else {
        await AudioDriver.setup(Module.config, Module.main_worker_rpcChannel.port2);
    }
}

async function setupWorker(Module)
{
    Module.worker = new Worker("distr/audioworker.js")

    var museAudioUrl = new URL("MuseAudio.js", window.location) + "";

    Module.worker.onmessage = function(event) {
        if (event.data.type == "WORKER_INITED") {
            Module.ccall('addSoundFont', '', ['string'], [Module.soundFont]);
        }
    }

    Module.worker.postMessage({
        type: 'INITIALIZE_WORKER',
        mainPort: Module.main_worker_rpcChannel.port2,
        driverPort: Module.driver_worker_rpcChannel.port2,
        options: {
            museAudioUrl: museAudioUrl
        }
    }, [Module.main_worker_rpcChannel.port2, Module.driver_worker_rpcChannel.port2]);
}

const MuImpl = {

    Module: {},

    loadModule: async function(opt) {

        this.Module = {
            config: config, // static configuration

            qt: {
                onLoaded: opt.onLoaded,
                onExit: opt.onExit,
                entryFunction: window.MuseScoreStudio_entry, // from MuseScoreStudio.js
                containerElements: [opt.screen],
            },

            soundFont: opt.soundFont,

            // called from cpp
            onStartApp: this._onStartApp.bind(this),

            // forward wasm-side diagnostics (qWarning/qDebug on stderr) to the
            // page so the last action before a crash is visible without devtools
            printErr: (...args) => {
                const line = args.join(' ');
                console.error('[wasm]', line);
                if (typeof opt.onLog === 'function') opt.onLog(line);
            },
        }

        setupRpc(this.Module);
        setupInternalCallbacks(this.Module);

        this.Module = await qtLoad(this.Module);

        return this.Module;
    },

    _onStartApp: async function() {
        await setupDriver(this.Module);

        if (config.MUSE_MODULE_AUDIO_WORKER == "ON") {
            await setupWorker(this.Module);
        }
    },

    loadScoreFile: async function(file) {
        if (!file) {
            return
        }

        const buffer = await file.arrayBuffer();
        this.loadScoreData(new Uint8Array(buffer))
    },

    loadScoreData: function(data) {
        const ptr = this.Module._malloc(data.length);
        this.Module.HEAPU8.set(data, ptr);
        this.Module._load(ptr, data.length);
        this.Module._free(ptr);
    },

    startAudioProcessing: async function() {
        if (this.Module.driver.inited) {
            this.Module._startAudioProcessing()
        } else {
            this.Module.isNeedStartAudio = true;
        }
    }
}

export default MuImpl;
