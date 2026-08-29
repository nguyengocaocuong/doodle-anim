#!/usr/bin/env node
/**
 * capture.mjs — deterministic frame-exact capture of a canvas animation page.
 *
 * The page must expose `window.__seek(tSeconds)` that renders the exact frame
 * for time t. This script steps t = frame/fps, grabs the canvas via toDataURL
 * (no compositor, pixel-exact), writes a PNG sequence, then encodes MP4.
 *
 * Usage:
 *   node capture.mjs --page ./doodle.html --out ./out --fps 30 --dur 12 \
 *        [--seed 7] [--count 9] [--scale 2] [--keep-frames] [--gif]
 */
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// Resolve playwright: local node_modules first, then global npm root, then ~/node_modules.
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  const candidates = [];
  try { candidates.push(execSync('npm root -g').toString().trim()); } catch {}
  candidates.push(path.join(process.env.HOME ?? '', 'node_modules'));
  let loaded = null;
  for(const root of candidates){
    try {
      const req = createRequire(path.join(root, 'noop.js'));
      loaded = req('playwright');
      break;
    } catch {}
  }
  if(!loaded){
    console.error('playwright not found. Install: npm i playwright && npx playwright install chromium');
    process.exit(1);
  }
  chromium = loaded.chromium;
}

function arg(name, dflt){
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i+1] : dflt;
}
const has = (name)=> process.argv.includes('--' + name);

const PAGE  = path.resolve(arg('page', './doodle.html'));
const OUT   = path.resolve(arg('out', './out'));
const FPS   = parseInt(arg('fps', '30'), 10);
const DUR   = parseFloat(arg('dur', '12'));
const SEED  = arg('seed', null);
const COUNT = arg('count', null);
const SCALE = parseFloat(arg('scale', '1'));   // devicePixelRatio for hi-res render
const FORMAT = arg('format', 'mp4');

fs.mkdirSync(OUT, { recursive: true });
const framesDir = path.join(OUT, 'frames');
fs.mkdirSync(framesDir, { recursive: true });

const url = new URL('file://' + PAGE);
if(SEED)  url.searchParams.set('seed', SEED);
if(COUNT) url.searchParams.set('count', COUNT);
const MIX = arg('mix', null);
if(MIX) url.searchParams.set('mix', MIX);
const STORY = arg('story', null);
if(STORY) url.searchParams.set('story', STORY);
const ROWS = arg('rows', null);
if(ROWS) url.searchParams.set('rows', ROWS);
url.searchParams.set('dur', String(DUR + 1));

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(url.toString());
const { w, h } = await page.evaluate(()=>{
  const c = document.querySelector('canvas');
  return { w: c.width, h: c.height };
});
await page.setViewportSize({ width: Math.round(w*SCALE), height: Math.round(h*SCALE) });
if(SCALE !== 1){
  await page.evaluate((s)=>{
    const c = document.querySelector('canvas');
    c.style.width = c.width + 'px'; c.style.height = c.height + 'px';
    const ctx = c.getContext('2d');
    // re-render through CSS scaling is lossy; instead upscale canvas buffer
    c.width = Math.round(c.width*s); c.height = Math.round(c.height*s);
    ctx.setTransform(s,0,0,s,0,0);
  }, SCALE);
  // rebind __seek to the scaled context
  await page.evaluate(()=>{
    const c = document.querySelector('canvas');
    const ctx = c.getContext('2d');
    const t0 = 0; window.__seek(t0);
  });
}

const total = Math.round(DUR * FPS);
const t0 = Date.now();
for(let f = 0; f < total; f++){
  const t = f / FPS;
  const dataUrl = await page.evaluate((tt)=>{ window.__seek(tt); return document.querySelector('canvas').toDataURL('image/png'); }, t);
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
  fs.writeFileSync(path.join(framesDir, `f${String(f).padStart(4,'0')}.png`), buf);
  if(f % 30 === 0) process.stdout.write(`\rframe ${f}/${total}`);
}
await browser.close();
console.log(`\rframe ${total}/${total} — captured in ${((Date.now()-t0)/1000).toFixed(1)}s`);

const outVideo = path.join(OUT, `anim.${FORMAT}`);
if(FORMAT === 'gif'){
  execFileSync('ffmpeg', ['-y','-loglevel','error','-framerate',String(FPS),
    '-i', path.join(framesDir,'f%04d.png'),
    '-vf','split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer',
    outVideo]);
}else{
  execFileSync('ffmpeg', ['-y','-loglevel','error','-framerate',String(FPS),
    '-i', path.join(framesDir,'f%04d.png'),
    '-c:v','libx264','-pix_fmt','yuv420p','-crf','18','-movflags','+faststart', outVideo]);
}
if(!has('keep-frames')) fs.rmSync(framesDir, { recursive: true, force: true });
console.log('wrote', outVideo);
