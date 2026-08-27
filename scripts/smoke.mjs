// HTTP smoke test for a running mscore-web-engine server.
//
// Verifies the endpoints a browser needs to boot the engine: demo page,
// embedding API, viewer, glue, and Range-served wasm / soundfont.
//
// Usage: node scripts/smoke.mjs [baseUrl]   (default http://127.0.0.1:8000)

const base = (process.argv[2] || 'http://127.0.0.1:8000').replace(/\/$/, '');

const checks = [
  ['demo page',         `${base}/examples/demo/`,                    { status: 200, contains: 'mscore-web-engine demo' }],
  ['embedding API',     `${base}/src/index.js`,                      { status: 200, contains: 'MuseScoreWeb' }],
  ['viewer',            `${base}/engine/viewer.html`,                { status: 200, contains: 'MuseScore Web Engine' }],
  ['muapi glue',        `${base}/engine/distr/muapi.js`,             { status: 200, contains: 'createMuApi' }],
  ['main engine js',    `${base}/engine/MuseScoreStudio.js`,         { status: 200, contains: 'MuseScoreStudio_entry' }],
  ['audio engine',      `${base}/engine/MuseAudio.js`,               { status: 200, contains: 'MuseAudio' }],
  ['wasm (Range)',      `${base}/engine/MuseScoreStudio.wasm`,       { status: 206, range: 'bytes=0-1023', minLen: 1024 }],
  ['soundfont (Range)', `${base}/engine/sound/MS%20Basic.sf3`,       { status: 206, range: 'bytes=0-1023', minLen: 1024 }],
];

let failed = 0;
for (const [name, url, opts] of checks) {
  try {
    const res = await fetch(url, opts.range ? { headers: { Range: opts.range } } : {});
    const body = await res.arrayBuffer();
    const text = new TextDecoder().decode(body.slice(0, 4096));
    const okStatus = res.status === opts.status;
    const okLen = body.byteLength >= (opts.minLen || 1);
    const okContains = !opts.contains || text.includes(opts.contains);
    if (okStatus && okLen && okContains) {
      console.log(`ok   ${name}  (${res.status}, ${body.byteLength} B)`);
    } else {
      failed++;
      console.error(`FAIL ${name}: status=${res.status} (want ${opts.status}), len=${body.byteLength} (want >=${opts.minLen || 1}), contains=${okContains}`);
    }
  } catch (err) {
    failed++;
    console.error(`FAIL ${name}: ${err.message}`);
  }
}

if (failed) {
  console.error(`\n${failed}/${checks.length} checks failed`);
  process.exit(1);
}
console.log(`\nall ${checks.length} checks passed`);
