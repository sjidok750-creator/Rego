// Offline, frame-accurate video renderer.
//
//   node render/render.mjs --mode stone --out output/dabotap_stone.mp4
//   node render/render.mjs --mode brick --stills 8,20,40 --outdir output/stills
//
// Serves web/ locally, points the page's CDN imports and Google Fonts at the
// copies in node_modules (no network needed), then seeks window.DABO frame by
// frame in headless Chromium and pipes PNG frames straight into ffmpeg.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : acc), []),
);
const MODE = args.mode || 'stone';
const W = Number(args.w || 1920), H = Number(args.h || 1080);
const FPS = Number(args.fps || 30);
const OUT = args.out || `output/dabotap_${MODE}.mp4`;

function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try { return execFileSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim(); } catch { return 'ffmpeg'; }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json' };
function serve() {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = null;
    if (u.startsWith('/fonts/')) file = path.join(ROOT, 'node_modules/@fontsource', u.slice(7));
    else file = path.join(ROOT, 'web', u === '/' ? 'index.html' : u);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

function fontCss(base) {
  const sheets = [
    ['noto-sans-kr', ['400', '500', '700']],
    ['noto-serif-kr', ['500', '700']],
    ['ibm-plex-mono', ['400', '500']],
  ];
  return sheets.flatMap(([pkg, ws]) => ws.map((w) => fs.readFileSync(path.join(ROOT, 'node_modules/@fontsource', pkg, `${w}.css`), 'utf8')
    .replaceAll('url(./files/', `url(${base}/fonts/${pkg}/files/`))).join('\n');
}

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--font-render-hinting=none'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.type(), m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@*/**', (route) => {
  const rel = new URL(route.request().url()).pathname.replace(/^\/npm\/three@[^/]+\//, '');
  route.fulfill({ path: path.join(ROOT, 'node_modules/three', rel), contentType: 'text/javascript' });
});
await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ body: fontCss(base), contentType: 'text/css' }));
await page.route('https://fonts.gstatic.com/**', (route) => route.abort());

await page.goto(`${base}/index.html?capture=1&mode=${MODE}`);
await page.waitForFunction(() => window.DABO);
await page.evaluate(() => window.DABO.ready);
// Warm every glyph subset the HUD will need, then wait for the fonts.
await page.evaluate(async () => {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;opacity:0;pointer-events:none';
  probe.textContent = document.getElementById('hud').textContent + '多寶塔 해체 완료 分解圖 천이백칠십여 년의 돌 亡失 행방불명 ×³';
  for (const f of ['"Noto Sans KR"', '"Noto Serif KR"', '"IBM Plex Mono"']) {
    for (const w of [400, 500, 700]) {
      const s = probe.cloneNode(true);
      s.style.font = `${w} 16px ${f}`;
      document.body.appendChild(s);
    }
  }
  await document.fonts.ready;
  await new Promise((r) => setTimeout(r, 400));
  await document.fonts.ready;
});
const stats = await page.evaluate(() => window.DABO.stats());
fs.mkdirSync(path.join(ROOT, 'output'), { recursive: true });
fs.writeFileSync(path.join(ROOT, `output/timeline_${MODE}.json`), JSON.stringify(stats, null, 1));
console.log(`mode=${MODE} duration=${stats.duration.toFixed(2)}s parts=${stats.parts} pieces=${stats.pieces}`, stats.brick ? `bricks=${stats.brick.total} studs=${stats.brick.studs} (${stats.brick.ms} ms)` : '');

if (args.stills) {
  const dir = path.join(ROOT, args.outdir || 'output/stills');
  fs.mkdirSync(dir, { recursive: true });
  for (const s of String(args.stills).split(',')) {
    const t = Number(s);
    const t0 = Date.now();
    await page.evaluate((x) => window.DABO.seek(x), t);
    const file = path.join(dir, `${MODE}_${String(t.toFixed(1)).padStart(5, '0')}.png`);
    await page.screenshot({ path: file });
    console.log('still', file, `${Date.now() - t0} ms`);
  }
} else {
  const from = Number(args.from || 0), to = Number(args.to || stats.duration);
  const f0 = Math.round(from * FPS), f1 = Math.round(to * FPS);
  fs.mkdirSync(path.dirname(path.join(ROOT, OUT)), { recursive: true });
  const ff = spawn(ffmpegPath(), [
    '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(args.crf || 17), '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', path.join(ROOT, OUT),
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const started = Date.now();
  let tSeek = 0, tShot = 0;
  for (let f = f0; f < f1; f++) {
    const a = Date.now();
    await page.evaluate((x) => window.DABO.seek(x), f / FPS);
    const b = Date.now();
    const buf = await page.screenshot({ type: 'png' });
    tSeek += b - a; tShot += Date.now() - b;
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if ((f - f0) % 30 === 0) {
      const done = f - f0 + 1, el = (Date.now() - started) / 1000;
      console.log(`frame ${f}/${f1}  ${(el / done).toFixed(2)} s/frame (seek ${(tSeek / done / 1000).toFixed(2)} shot ${(tShot / done / 1000).toFixed(2)})  eta ${((f1 - f) * el / done / 60).toFixed(1)} min`);
    }
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log('wrote', OUT, `${((Date.now() - started) / 60000).toFixed(1)} min`);
}

await browser.close();
server.close();
