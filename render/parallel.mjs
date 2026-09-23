// Render one edition in parallel chunks, then join them losslessly.
//   node render/parallel.mjs --mode brick --workers 3
// Chromium's software GL (SwiftShader) keeps only about one core busy per
// browser, so several browsers on disjoint frame ranges use the whole machine.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith('--') ? [...a, [x.slice(2), arr[i + 1]]] : a), []));
const mode = args.mode || 'stone';
const workers = Number(args.workers || 3);
const fps = Number(args.fps || 30);
const out = args.out || `output/dabotap_${mode}_video.mp4`;
const duration = Number(args.duration || JSON.parse(fs.readFileSync(path.join(ROOT, `output/timeline_${mode}.json`))).duration);
const ffmpeg = execFileSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();

const frames = Math.round(duration * fps);
const per = Math.ceil(frames / workers);
const dir = path.join(ROOT, 'output/chunks');
fs.mkdirSync(dir, { recursive: true });
const jobs = [];
for (let w = 0; w < workers; w++) {
  const f0 = w * per, f1 = Math.min(frames, (w + 1) * per);
  if (f0 >= f1) break;
  const file = `output/chunks/${mode}_${w}.mp4`;
  jobs.push({ file, p: new Promise((resolve, reject) => {
    const c = spawn('node', ['render/render.mjs', '--mode', mode, '--fps', String(fps), '--from', String(f0 / fps), '--to', String(f1 / fps), '--out', file], { cwd: ROOT });
    c.stdout.on('data', (d) => process.stdout.write(`[${mode}#${w}] ${d}`));
    c.stderr.on('data', (d) => process.stderr.write(`[${mode}#${w}] ${d}`));
    c.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`worker ${w} exited ${code}`))));
  }) });
}
await Promise.all(jobs.map((j) => j.p));
const list = path.join(dir, `${mode}_list.txt`);
fs.writeFileSync(list, jobs.map((j) => `file '${path.join(ROOT, j.file)}'`).join('\n'));
execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', path.join(ROOT, out)]);
console.log('joined', out);
