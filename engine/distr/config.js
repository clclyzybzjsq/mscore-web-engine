
// Audio pipeline mode:
//   OFF - the audio engine wasm (MuseAudio.js) runs directly inside the
//         AudioWorklet processor (single-threaded, simplest deployment).
//   ON  - the audio engine runs in a dedicated Worker and streams audio
//         frames to the processor over a MessageChannel.
const config = {
    MUSE_MODULE_AUDIO_WORKER: 'OFF'
};

export default config;
