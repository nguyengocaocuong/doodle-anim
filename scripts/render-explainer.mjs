#!/usr/bin/env node
/**
 * render-explainer.mjs — full pipeline for a narrated doodle explainer clip.
 *
 *   node render-explainer.mjs --script story.json --out out/myvideo [--fps 30] [--voice Samantha] [--rate 178]
 *
 * story.json: [{ "visual":"bedroom", "line":"You said it.", "char":"cat" }, ...]
 * - `visual` must exist in explainer.html's VISUALS registry
 * - `line` is voiced with macOS `say` and shown as karaoke captions
 * - `char` optional: protagonist from the CHARACTERS registry (default "dude")
 * - scene duration = voice duration + 0.45s (min 2.6s); empty line -> 3.5s
 *
 * Output: <out>/explainer.mp4 (video + voice, 1280x720).
 */
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { writeWav, synthBGM, synthSFX } from './audio.mjs';

// --- playwright resolution (local, global, ~/node_modules) ---
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  const candidates = [];
  try { candidates.push(execSync('npm root -g').toString().trim()); } catch {}
  candidates.push(path.join(process.env.HOME ?? '', 'node_modules'));
  let loaded = null;
  for(const root of candidates){
    try { loaded = createRequire(path.join(root, 'noop.js'))('playwright'); break; } catch {}
  }
  if(!loaded){ console.error('playwright not found: npm i playwright && npx playwright install chromium'); process.exit(1); }
  chromium = loaded.chromium;
}

function arg(name, dflt){
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i+1] : dflt;
}
const SCRIPT = path.resolve(arg('script', './story.json'));
const OUT    = path.resolve(arg('out', './out'));
const FPS    = parseInt(arg('fps', '30'), 10);
const VOICE  = arg('voice', 'Samantha');
const RATE   = arg('rate', '178');
const SIZE   = arg('size', '1280x720');       // '720x1280' for vertical/shorts
const [VW, VH] = SIZE.split('x').map(Number);
const NO_BGM = process.argv.includes('--no-bgm');
const NO_SFX = process.argv.includes('--no-sfx');
const PREVIEW = process.argv.includes('--preview');   // draft: no TTS/mix, 3.2s per shot
const PAGEARG = arg('page', null);
const PAGE = (()=>{
  if(PAGEARG) return path.resolve(PAGEARG);
  const here = path.dirname(new URL(import.meta.url).pathname);
  const skillLayout = path.join(here, '..', 'templates', 'explainer.html');
  if(fs.existsSync(skillLayout)) return skillLayout;
  return path.join(here, 'explainer.html');
})();

const scenes = JSON.parse(fs.readFileSync(SCRIPT, 'utf8'));
fs.mkdirSync(OUT, { recursive: true });
const audioDir = path.join(OUT, 'audio');
fs.mkdirSync(audioDir, { recursive: true });

/* ---------- 1) voice per line, measure durations ---------- */
console.log('· TTS (%s @ %swpm)', VOICE, RATE);
const timeline = [];
let acc = 0;
for(let i=0;i<scenes.length;i++){
  const sc = scenes[i];
  let dur = 4.2, wav = null;
  if(PREVIEW){
    dur = 3.2;   // fixed shot length in draft mode — composition check only
    timeline.push({ ...sc, dur, t0: acc });
    acc += dur;
    continue;
  }
  if(sc.line && sc.line.trim()){
    const aiff = path.join(audioDir, `line${i}.aiff`);
    wav = path.join(audioDir, `line${i}.wav`);
    execFileSync('say', ['-v', VOICE, '-r', RATE, '-o', aiff, sc.line]);
    execFileSync('ffmpeg', ['-y','-loglevel','error','-i', aiff, wav]);
    const d = parseFloat(execFileSync('ffprobe', ['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1', wav]).toString().trim());
    dur = Math.max(d + 1.0, 3.2);   // breathing room after each line
  }
  timeline.push({ ...sc, dur, t0: acc });
  acc += dur;
}
const total = acc;
console.log('· timeline:', total.toFixed(1) + 's', timeline.map(s=>`${s.visual}:${s.dur.toFixed(1)}`).join(' '));

/* ---------- 2) capture frames ---------- */
const framesDir = path.join(OUT, 'frames');
fs.mkdirSync(framesDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{ width:VW, height:VH } });
await page.goto('file://' + PAGE + `?w=${VW}&h=${VH}`);
const realTotal = await page.evaluate((sc)=> window.__setScenes(sc.map(({visual,keyword,line,dur,char,cam})=>({visual,keyword,line,dur,char,cam}))), timeline);
const totalFrames = Math.round(realTotal * FPS);
const t0 = Date.now();
for(let f = 0; f < totalFrames; f++){
  const dataUrl = await page.evaluate((tt)=>{ window.__seek(tt); return document.querySelector('canvas').toDataURL('image/png'); }, f / FPS);
  fs.writeFileSync(path.join(framesDir, `f${String(f).padStart(4,'0')}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
  if(f % 60 === 0) process.stdout.write(`\r· frame ${f}/${totalFrames}`);
}
await browser.close();
console.log(`\r· frame ${totalFrames}/${totalFrames} — ${((Date.now()-t0)/1000).toFixed(1)}s`);

/* ---------- 3) encode video ---------- */
const silentMp4 = path.join(OUT, 'silent.mp4');
execFileSync('ffmpeg', ['-y','-loglevel','error','-framerate',String(FPS),
  '-i', path.join(framesDir,'f%04d.png'),
  '-c:v','libx264','-pix_fmt','yuv420p','-crf','18','-movflags','+faststart', silentMp4]);

const outMp4 = path.join(OUT, 'explainer.mp4');
if(PREVIEW){
  fs.renameSync(silentMp4, outMp4);   // draft mode: silent composition check
}else{
/* ---------- 4) build voice track (each line delayed to its t0) + BGM/SFX + mux ---------- */
const inputs = [], filterParts = [], mixLabels = [];
let audioN = 0;
timeline.forEach((sc, i)=>{
  if(!sc.line || !sc.line.trim()) return;
  const wav = path.join(audioDir, `line${i}.wav`);
  const idx = 1 + audioN++;   // input 0 is the silent video
  inputs.push('-i', wav);
  filterParts.push(`[${idx}:a]adelay=${Math.round(sc.t0*1000)}|${Math.round(sc.t0*1000)}[a${i}]`);
  mixLabels.push(`[a${i}]`);
});
// procedural bed + event sounds (opt out with --no-bgm / --no-sfx)
if(!NO_BGM){
  const bgm = path.join(audioDir, 'bgm.wav');
  writeWav(fs, bgm, synthBGM(total));
  const idx = 1 + audioN++;
  inputs.push('-i', bgm);
  filterParts.push(`[${idx}:a]volume=0.30[bgm]`);
  mixLabels.push('[bgm]');
  console.log('· BGM: lo-fi pad bed');
}
if(!NO_SFX){
  const sfx = path.join(audioDir, 'sfx.wav');
  writeWav(fs, sfx, synthSFX(timeline));
  const idx = 1 + audioN++;
  inputs.push('-i', sfx);
  filterParts.push(`[${idx}:a]volume=0.85[sfx]`);
  mixLabels.push('[sfx]');
  console.log('· SFX: scene event sounds');
}
if(mixLabels.length){
  const filter = filterParts.join(';') + `;${mixLabels.join('')}amix=inputs=${mixLabels.length}:normalize=0,volume=1.6,apad=whole_dur=${realTotal.toFixed(2)}[aout]`;
  execFileSync('ffmpeg', ['-y','-loglevel','error','-i', silentMp4, ...inputs,
    '-filter_complex', filter, '-map','0:v','-map','[aout]',
    '-c:v','copy','-c:a','aac','-b:a','160k','-shortest', outMp4]);
}else{
  fs.renameSync(silentMp4, outMp4);
}
}
fs.rmSync(framesDir, { recursive:true, force:true });
fs.rmSync(silentMp4, { force:true });
console.log('✓ wrote', outMp4, `(${realTotal.toFixed(1)}s)`);
