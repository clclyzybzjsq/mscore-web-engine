/**
 * MuseScoreWeb — high-level embedding API for the mscore-web-engine.
 *
 * Wraps the engine viewer (engine/viewer.html) in an <iframe> and speaks the
 * postMessage protocol defined there. Zero dependencies; usable from any
 * browser page (plain JS or bundled app).
 *
 * Usage:
 *   const mscore = new MuseScoreWeb({
 *     container: document.getElementById('host'),   // element to host the iframe
 *     engineUrl: '/mscore-web-engine/engine/viewer.html', // where the engine lives
 *     onReady: (v) => console.log('engine', v),
 *     onSaved: (payload) => { /* payload.data is a Uint8Array of the .mscz *\/ },
 *     onError: (e) => console.error(e),
 *   });
 *   await mscore.load({ name: 'score.mscz', data: uint8Array });
 */
export class MuseScoreWeb {
  constructor(options) {
    this.container = options.container;
    this.engineUrl = options.engineUrl || 'engine/viewer.html';
    this.handlers = {
      onReady: options.onReady || null,
      onScoreLoaded: options.onScoreLoaded || null,
      onSaved: options.onSaved || null,
      onError: options.onError || null,
      onLog: options.onLog || null,
    };
    this.iframe = null;
    this.ready = false;
    this._messageHandler = (event) => this._onMessage(event);
  }

  mount() {
    if (this.iframe) return;
    this.iframe = document.createElement('iframe');
    this.iframe.src = this.engineUrl;
    this.iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;';
    this.iframe.setAttribute('allow', 'autoplay; clipboard-write');
    this.container.style.position = this.container.style.position || 'relative';
    this.container.appendChild(this.iframe);
    window.addEventListener('message', this._messageHandler);
  }

  destroy() {
    if (!this.iframe) return;
    window.removeEventListener('message', this._messageHandler);
    this.iframe.remove();
    this.iframe = null;
    this.ready = false;
  }

  /** Load a score from raw bytes (mscz / mscx / musicxml). */
  async load({ name = '', data }) {
    if (!this.iframe) this.mount();
    this._post('load-score', { name, data });
    // The viewer acks asynchronously via 'score-loaded'; await a short settle
    // so callers can chain without racing the next command.
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  /** Ask the engine to save the current score; result arrives as onSaved. */
  save() {
    if (!this.ready) return;
    this._post('save-score', {});
  }

  /** Start audio playback (must follow a user gesture in most browsers). */
  async play() {
    if (!this.iframe) return;
    // The engine starts audio on the first user gesture inside the iframe;
    // forwarding a synthetic click is the most reliable cross-origin-free
    // approach since both sides are same-origin in the default deployment.
    this.iframe.contentWindow.dispatchEvent(new Event('click'));
  }

  _post(type, payload) {
    if (!this.iframe || !this.iframe.contentWindow) return;
    this.iframe.contentWindow.postMessage(
      { source: 'mscore-web-engine-host', type, payload: payload || {} },
      '*'
    );
  }

  _onMessage(event) {
    const msg = event.data;
    if (!msg || msg.source !== 'mscore-web-engine') return;
    switch (msg.type) {
      case 'ready':
        this.ready = true;
        if (this.handlers.onReady) this.handlers.onReady(msg.payload || {});
        break;
      case 'score-loaded':
        if (this.handlers.onScoreLoaded) this.handlers.onScoreLoaded(msg.payload || {});
        break;
      case 'saved':
        if (this.handlers.onSaved) this.handlers.onSaved(msg.payload || {});
        break;
      case 'error':
        if (this.handlers.onError) this.handlers.onError(msg.payload || {});
        break;
      case 'log':
        if (this.handlers.onLog) this.handlers.onLog(msg.payload || {});
        break;
    }
  }
}

export default MuseScoreWeb;
