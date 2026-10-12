#!/usr/bin/env node
// ============================================================================
// scripts/render-story.mjs — Universal story renderer for doodle-anim
//
// Render a story JSON into an MP4 using the doodle-anim engine (Human class)
// via Playwright frame capture + ffmpeg encode.
//
// Usage:
//   node scripts/render-story.mjs <story.json> <output.mp4>
//
// Env:
//   ONLY=<scene-id>   render only one scene (debug)
//   TEST_SHOTS=1      save /tmp/story-<scene>-t<N>.png instead of full render
//
// Story JSON format:
// {
//   "title": "My story",
//   "size": "1920x1080",          // WxH
//   "fps": 30,
//   "audio": "music.mp3",         // optional, mixed into final mp4
//   "scenes": [
//     {
//       "id": "s1",
//       "duration": 10,
//       "background": { "color": "#aee2ff" },        // solid color
//       // or { "image": "backgrounds/bg.png" },    // path (relative to story file, then repo)
//       // or omit -> doodle paper background
//       "groundY": 880,                             // default: H*0.85
//       "title": "SCENE TITLE",                    // title card, first 3s
//       "subtitles": [ { "t0": 1, "t1": 5, "text": "Xin chào" } ],
//       "cam": { "x": [0, 100], "y": [0, 0], "z": [1, 1] },  // linear cam move (optional)
//       "weather": { "rain": 60, "snow": 0, "fog": 40, "dust": 0, "leaves": 0 },
//       "overlays": [                                        // emoji / bubbles
//         { "type": "emoji", "value": "😢", "x": 960, "y": 400, "size": 72, "t0": 1, "t1": 4 },
//         { "type": "bubble", "value": "speech", "text": "Xin chào!",
//           "x": 960, "y": 300, "size": 64, "t0": 0.5, "t1": 3 }
//       ],
//       "characters": [
//         {
//           "preset": "an",                        // built-in preset (see PRESETS)
//           "h": 290,                              // height px
//           "x": 540, "y": 880,                    // static position (if no moves)
//           "moves": [                             // timeline segments (optional)
//             { "m": "walk", "t0": 0, "t1": 4, "x0": -100, "y0": 880, "x1": 500, "y1": 880 },
//             { "m": "idle", "t0": 4, "t1": 10, "x0": 500, "y0": 880, "x1": 500, "y1": 880 }
//           ],
//           // stationary actions (m): cry kneel sweep bow point angry
//           //   combat: punch punch_hook kick kick_round block dodge fall
//           //   interaction: handshake hug pat give push pull
//           //   e.g. { "m": "punch", "t0": 4, "t1": 5.2, "x0": 500, "y0": 880, "x1": 500, "y1": 880 }
//           // Camera (optional): keyframed {x,y,z} with times t (seconds)
//           //   "cam": { "x": [0, 500], "y": [0, 0], "z": [1.0, 1.5], "t": [0, 5] }
//           //   without "t": linear over scene duration (legacy {x:[a,b]} form)
//           //   presets: close-up z~1.9, medium z~1.25, wide z~0.85
//           "dir": 1,
//           "attrs": { "clothC": "#ff0000" },      // override appearance
//           "seed": 42,
//           "emotes": [ { "what": "!", "t0": 4, "t1": 6 } ]   // ! ? ... heart sweat music
//         }
//       ]
//     }
//   ]
// }
//
// Scene SFX (optional):
//   "scenes": [ { ..., "sfx": [
//       { "key": "rain", "t0": 0, "volume": 80, "loop": true },
//       { "key": "thunder", "t0": 2.5, "volume": 90 }
//   ] } ]
// SFX keys are synthesized server-side by scripts/sfx-synth.mjs (same recipes
// as Doodle Studio's Web Audio preview), so no audio files are needed.
//
// Scene transitions (optional) — applied BETWEEN consecutive scenes:
//   "scenes": [
//     { "id": "s1", "duration": 10, ... },                       // first scene: no transition
//     { "id": "s2", "duration": 8, "transition": { "type": "fade", "duration": 0.8 }, ... },
//   ]
// "type": none | fade | wipe | slide | zoom | iris | dissolve
//   - the transition INTO scene N overlaps the tail of scene N-1
//   - final video duration = sum(durations) - sum(transition durations)
//   - implemented with ffmpeg xfade (zoom = zoompan + fade, iris = circleopen)
// ============================================================================
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync, mkdtempSync, existsSync } from 'fs';
import { execSync, execFileSync } from 'child_process';
import { dirname, join, resolve, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { ensureSfxWav, SFX_DUR } from './sfx-synth.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const TEMPLATES_DIR = join(REPO_ROOT, 'templates');

// ---- Scene transitions: Studio id -> ffmpeg xfade transition ----
const XFADE_MAP = {
  fade: 'fade', wipe: 'wipeleft', slide: 'slideleft',
  iris: 'circleopen', dissolve: 'dissolve',
  // 'zoom' is custom (zoompan + fade); 'none' = hard cut
};
const TRANSITION_IDS = ['none', 'fade', 'wipe', 'slide', 'zoom', 'iris', 'dissolve'];

function normTransition(t){
  const type = (t && TRANSITION_IDS.includes(t.type)) ? t.type : 'none';
  let duration = Math.min(3, Math.max(0.2, +(t && t.duration) || 0.8));
  return { type, duration };
}

// Absolute start time of each scene in the FINAL video (after transitions
// eat into the tail of the previous scene). scenes[0] starts at 0.
// 'none' (hard cut) still overlaps 1 frame in the xfade chain, so the audio
// model uses the same overlap to stay sample-accurate with video.
function boundaryOverlap(scenes, i, fps){
  const t = normTransition(scenes[i] && scenes[i].transition);
  if (t.type === 'none') return 1 / fps;
  return t.duration;
}
function sceneStartTimes(scenes, fps){
  const starts = [0];
  for (let i = 1; i < scenes.length; i++)
    starts.push(starts[i-1] + scenes[i-1].duration - boundaryOverlap(scenes, i, fps));
  return starts;
}

// ---- Built-in character presets (from doodle-anim character work) ----
const PRESETS = {
  an:   { skinC: '#f0d0b0', hairC: '#1a1a1a', hair: 'bowl',     clothC: '#6a9ab0', mouth: 'smile', eyeStyle: 'open', glasses: false, seed: 101 },
  binh: { skinC: '#e8b98a', hairC: '#6b3a26', hair: 'curly',    clothC: '#8aa860', mouth: 'smile', eyeStyle: 'open', glasses: false, seed: 102 },
  chi:  { skinC: '#fdf2ee', hairC: '#c9a25e', hair: 'pigtails', clothC: '#e8a0b0', mouth: 'smile', eyeStyle: 'open', glasses: false, seed: 103 },
  dung: { skinC: '#a06a42', hairC: '#1a1712', hair: 'afro',     clothC: '#e0a05a', mouth: 'smile', eyeStyle: 'open', glasses: false, seed: 104 },
  // ---- Tấm Cám characters ----
  tam:   { skinC: '#f2d3ae', hairC: '#141210', hair: 'strands', longHair: true,  clothC: '#8a5a3a', outfit: 'dress', aoDai: true, mouth: 'smile', eyeStyle: 'open', brows: 'soft',  seed: 201 },
  cam:   { skinC: '#f5d8b8', hairC: '#1a1512', hair: 'buns',    clothC: '#e08aa0', outfit: 'dress', aoDai: true, mouth: 'flat',  eyeStyle: 'open', brows: 'angry', seed: 202 },
  dighe: { skinC: '#e8c39e', hairC: '#2a2018', hair: 'bowl',    topknot: true,   clothC: '#7a5a9a', outfit: 'dress', aoDai: true, mouth: 'frown', eyeStyle: 'open', brows: 'angry', seed: 203 },
  but:   { skinC: '#eecfa8', hairC: '#e8e4da', hair: 'strands', beard: 'white',  clothC: '#d8a83a', outfit: 'shirt', mouth: 'smile', eyeStyle: 'calm', brows: 'soft',  seed: 204 },
  vua:   { skinC: '#f0d0a8', hairC: '#1a1a1a', hair: 'bowl',    crown: true,     clothC: '#e8b83a', outfit: 'shirt', mouth: 'flat',  eyeStyle: 'open', brows: 'none',  seed: 205 },
};

// ---- Timeline with phase continuity (walk cycle doesn't jump between segs) ----
function makeTL(segs) {
  let phase = 0;
  const tl = [];
  const ACTIONS = ['cry','kneel','sweep','bow','point','angry',
    'punch','punch_hook','kick','kick_round','block','dodge','fall',
    'handshake','hug','pat','give','push','pull'];
  for (const s of segs) {
    const dist = Math.hypot((s.x1 ?? 0) - (s.x0 ?? 0), (s.y1 ?? 0) - (s.y0 ?? 0));
    const dur = s.t1 - s.t0;
    const moving = s.m === 'walk' || s.m === 'run';
    const speed = moving ? Math.max(dist / Math.max(dur, 0.001), s.m === 'run' ? 60 : 40) : 0;
    tl.push({
      t0: s.t0, t1: s.t1, x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1,
      dir: s.dir ?? ((s.x1 ?? 0) >= (s.x0 ?? 0) ? 1 : -1),
      walk: s.m === 'walk', run: s.m === 'run', phase0: phase, speed,
      action: ACTIONS.includes(s.m) ? s.m : null,
    });
    if (moving) phase += dur * speed * 0.085;
  }
  return tl;
}

// ---- Load doodle engine scripts (strip boot code) ----
function loadEngineScripts() {
  const html = readFileSync(join(TEMPLATES_DIR, 'doodle.html'), 'utf-8');
  const all = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  let scripts = all.join('\n');
  const bootIdx = scripts.indexOf('/* ---------- boot ---------- */');
  if (bootIdx !== -1) scripts = scripts.substring(0, bootIdx);
  console.log(`✓ Engine loaded (${scripts.length} chars, boot stripped)`);
  return scripts;
}

// ---- Load Doodle Studio weather engine (deterministic particles) ----
// Single source of truth: doodle-studio/js/weather-engine.js
//   Docker layout: <repo>/studio/js/weather-engine.js   (repo served at /app)
//   VM layout:     <repo>/../doodle-studio/js/weather-engine.js
function loadWeatherEngine() {
  const candidates = [
    join(REPO_ROOT, 'studio', 'js', 'weather-engine.js'),
    resolve(REPO_ROOT, '..', 'doodle-studio', 'js', 'weather-engine.js'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      console.log(`✓ Weather engine loaded: ${c}`);
      return readFileSync(c, 'utf-8');
    }
  }
  console.log('⚠ Weather engine not found — scene.weather will be ignored');
  return null;
}

// ---- Resolve background image path ----
function resolveBgImage(bgImage, storyDir) {
  const candidates = [
    isAbsolute(bgImage) ? bgImage : join(storyDir, bgImage),
    join(REPO_ROOT, bgImage),
    join(process.cwd(), bgImage),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error(`Background image not found: ${bgImage}`);
}

// ---- Build per-scene HTML page ----
function buildSceneHtml(scene, story, engineScripts, weatherSrc, bgDataUrl, W, H) {
  const dur = scene.duration;
  const gy = scene.groundY ?? Math.round(H * 0.85);

  const charBlocks = (scene.characters || []).map((c, i) => {
    const preset = c.preset ? (PRESETS[c.preset] || {}) : {};
    const attrs = { ...preset, ...(c.attrs || {}) };
    const seed = c.seed ?? attrs.seed ?? (1000 + i * 77);
    delete attrs.seed;
    const tl = c.moves && c.moves.length
      ? makeTL(c.moves)
      : makeTL([{ m: 'idle', t0: 0, t1: dur, x0: c.x ?? W / 2, y0: c.y ?? gy, x1: c.x ?? W / 2, y1: c.y ?? gy, dir: c.dir ?? 1 }]);
    const emotes = (c.emotes || []).map((e, j) =>
      `{what:${JSON.stringify(e.what)},t0:${e.t0},t1:${e.t1},seed:${seed * 10 + j}}`).join(',');
    return `{
      const cls = ${JSON.stringify(c.kind === 'pet' ? 'Pet' : 'Human')};
      const petOpt = ${JSON.stringify(c.kind === 'pet' ? { petKind: c.petKind || 'dog' } : {})};
      const h = new (cls === 'Pet' ? Pet : Human)(${seed}, Object.assign({ h: ${c.h || 290}, duration: ${dur}, W: ${W}, groundTop: ${gy}, groundBot: ${gy}, x0: ${W / 2} }, petOpt));
      Object.assign(h, ${JSON.stringify(attrs)});
      h.tl = ${JSON.stringify(tl)};
      h.emotes = [${emotes}];
      window.__chars.push(h);
    }`;
  }).join('\n');

  const cam = scene.cam || {};
  // Camera keyframes: {x:[..], y:[..], z:[..], t:[..]} — piecewise smooth interp;
  // without t, linear over full duration (legacy {x:[a,b]} form).
  const camJs = `function(t){
    const d = ${dur};
    const keys = ${JSON.stringify(cam.t || null)};
    const interp = (a) => {
      if(!a || !a.length) return null;
      if(!keys || keys.length !== a.length){
        const u = Math.min(1, t/d);
        return a[0] + (a[a.length-1]-a[0])*u;
      }
      if(t <= keys[0]) return a[0];
      for(let i=0;i<keys.length-1;i++){
        if(t <= keys[i+1]){
          const u = (t-keys[i])/Math.max(1e-6, keys[i+1]-keys[i]);
          const e = u*u*(3-2*u);
          return a[i] + (a[i+1]-a[i])*e;
        }
      }
      return a[a.length-1];
    };
    const gx = (v, fb) => { const r = interp(v); return r == null ? fb : r; };
    return { x: gx(${JSON.stringify(cam.x || null)}, 0),
             y: gx(${JSON.stringify(cam.y || null)}, 0),
             z: gx(${JSON.stringify(cam.z || null)}, 1) };
  }`;

  const bgJs = bgDataUrl
    ? `const __bgImg = new Image();
       __bgImg.src = ${JSON.stringify(bgDataUrl)};
       __bgImg.onload = () => { window.__bgReady = true; };
       __bgImg.onerror = () => { window.__bgError = true; };`
    : `const __bgImg = null;
       window.__bgReady = true; /* no image bg */`;
  const bgColor = (scene.background && scene.background.color) || null;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:#000}canvas{display:block}</style></head>
<body><canvas id="cv" width="${W}" height="${H}"></canvas>
<script>${engineScripts}<\/script>
${weatherSrc ? `<script>${weatherSrc}<\/script>` : '<script>window.WeatherEngine=null;<\/script>'}
<script>
(function(){
const W = ${W}, H = ${H}, DUR = ${dur};
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
window.__chars = [];
${charBlocks}
${bgJs}
const __subs = ${JSON.stringify(scene.subtitles || [])};
const __title = ${JSON.stringify(scene.title || '')};
const __weather = ${JSON.stringify(scene.weather || {})};
const __overlays = ${JSON.stringify(scene.overlays || [])};
const camFn = ${camJs};
const __bgColor = ${JSON.stringify(bgColor)};

function __rrPath(c, px, py, pw, ph, r){
  r = Math.min(r, pw/2, ph/2);
  c.beginPath();
  c.moveTo(px+r, py);
  c.arcTo(px+pw, py, px+pw, py+ph, r);
  c.arcTo(px+pw, py+ph, px, py+ph, r);
  c.arcTo(px, py+ph, px, py, r);
  c.arcTo(px, py, px+pw, py, r);
  c.closePath();
}
function __drawOverlays(t){
  for (const ov of __overlays){
    const t0 = ov.t0 || 0, t1 = (ov.t1 == null ? DUR : ov.t1);
    if (t < t0 || t > t1) continue;
    const size = ov.size || 64;
    const ox = (ov.x == null ? W/2 : ov.x), oy = (ov.y == null ? H/2 : ov.y);
    if (ov.type === 'emoji'){
      ctx.font = size + 'px serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ov.value || '✨', ox, oy);
    } else {
      const st = ov.value || 'speech';
      const fs = Math.max(14, Math.round(size * 0.34));
      ctx.font = '600 ' + fs + 'px "DejaVu Sans", sans-serif';
      const tw = ctx.measureText(ov.text || '').width;
      const pw = tw + size * 0.9, ph = fs * 2.1;
      const bx = ox - pw/2, by = oy - ph/2;
      if (st === 'shout'){ ctx.fillStyle = '#ffeb3b'; ctx.strokeStyle = '#d32f2f'; ctx.lineWidth = 4; }
      else { ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.strokeStyle = '#555a66'; ctx.lineWidth = 2; }
      if (st === 'thought') ctx.setLineDash([8, 6]);
      __rrPath(ctx, bx, by, pw, ph, size * 0.25);
      ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = st === 'shout' ? '#ffeb3b' : 'rgba(255,255,255,0.96)';
      ctx.beginPath();
      ctx.moveTo(ox - 14, by + ph - 2); ctx.lineTo(ox + 14, by + ph - 2); ctx.lineTo(ox - 26, by + ph + 30);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#23262e';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ov.text || '', ox, oy);
    }
  }
}

window.__seek = function(t){
  // --- background ---
  if (__bgImg) {
    ctx.drawImage(__bgImg, 0, 0, W, H);
  } else if (__bgColor) {
    ctx.fillStyle = __bgColor; ctx.fillRect(0, 0, W, H);
  } else {
    paper(ctx, W, H, 7);   // doodle paper texture from engine
  }
  // --- camera + characters ---
  const cam = camFn(t);
  ctx.save();
  ctx.translate(W/2, H/2); ctx.scale(cam.z, cam.z); ctx.translate(-W/2 - cam.x, -H/2 - cam.y);
  for (const h of window.__chars) h.draw(ctx, t, 1);
  ctx.restore();
  // --- weather particles (deterministic; screen space) ---
  try {
    if (window.WeatherEngine && window.WeatherEngine.drawWeather)
      window.WeatherEngine.drawWeather(ctx, __weather, t, W, H);
  } catch (e) { /* weather optional */ }
  // --- emoji / bubble overlays (screen space) ---
  __drawOverlays(t);
  // --- title card (first 3s) ---
  if (__title && t < 3) {
    const fs = Math.round(H * 0.055);
    ctx.font = 'bold ' + fs + 'px "DejaVu Sans", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(__title).width;
    const a = Math.min(1, t / 0.5);
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(W/2 - tw/2 - 30, H*0.06, tw + 60, fs * 1.7);
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(__title, W/2, H*0.06 + fs*0.85);
    ctx.restore();
  }
  // --- subtitles ---
  if (__subs.length) {
    const fs = Math.round(H * 0.032);
    ctx.font = 'bold ' + fs + 'px "DejaVu Sans", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const s of __subs) {
      if (t >= s.t0 && t < s.t1) {
        const tw = ctx.measureText(s.text).width;
        const bx = W/2, by = H*0.90;
        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx - tw/2 - 24, by - fs*0.95, tw + 48, fs*1.9, 18);
        else ctx.rect(bx - tw/2 - 24, by - fs*0.95, tw + 48, fs*1.9);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillText(s.text, bx, by);
      }
    }
  }
};
window.__sceneReady = true;
})();
<\/script></body></html>`;
}

// ============================================================================
async function main() {
  const [storyPath, outPath] = process.argv.slice(2);
  if (!storyPath || !outPath) {
    console.error('Usage: node scripts/render-story.mjs <story.json> <output.mp4>');
    process.exit(1);
  }
  const storyAbs = resolve(process.cwd(), storyPath);
  const storyDir = dirname(storyAbs);
  const story = JSON.parse(readFileSync(storyAbs, 'utf-8'));

  const [W, H] = (story.size || '1920x1080').split('x').map(Number);
  const fps = story.fps || 30;
  console.log(`Story: ${story.title || '(untitled)'} — ${W}x${H} @${fps}fps, ${story.scenes.length} scenes`);

  const engineScripts = loadEngineScripts();
  const weatherSrc = loadWeatherEngine();
  const ONLY = process.env.ONLY || null;
  const TEST_SHOTS = process.env.TEST_SHOTS === '1';

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', err => console.log('  PAGEERROR:', err.message));

  const tmpRoot = mkdtempSync(join(os.tmpdir(), 'doodle-story-'));
  const segFiles = [];
  const renderedScenes = [];   // story.scenes entries parallel to segFiles

  for (const scene of story.scenes) {
    if (ONLY && scene.id !== ONLY) continue;
    renderedScenes.push(scene);
    console.log(`\n[scene ${scene.id}] ${scene.duration}s ...`);

    let bgDataUrl = null;
    if (scene.background && scene.background.image) {
      const p = resolveBgImage(scene.background.image, storyDir);
      const buf = readFileSync(p);
      bgDataUrl = `data:image/png;base64,${buf.toString('base64')}`;
      console.log(`  bg image: ${p} (${buf.length} bytes)`);
    }

    await page.goto('about:blank');   // reset JS realm between scenes
    await page.setContent(buildSceneHtml(scene, story, engineScripts, weatherSrc, bgDataUrl, W, H));
    await page.waitForFunction('window.__sceneReady === true', { timeout: 20000 });
    if (bgDataUrl) {
      await page.waitForFunction('window.__bgReady === true', { timeout: 30000 });
      console.log('  ✓ background loaded');
    }

    if (TEST_SHOTS) {
      for (const t of [0.5, Math.min(2, scene.duration / 2), scene.duration - 0.5]) {
        await page.evaluate(`window.__seek(${t})`);
        await page.screenshot({ path: `/tmp/story-${scene.id}-t${t}.png` });
      }
      console.log('  ✓ test shots -> /tmp/story-*.png');
      continue;
    }

    const framesDir = join(tmpRoot, scene.id);
    mkdirSync(framesDir, { recursive: true });
    const total = Math.round(scene.duration * fps);
    for (let f = 0; f < total; f++) {
      await page.evaluate(`window.__seek(${(f / fps).toFixed(4)})`);
      await page.screenshot({ path: join(framesDir, `f${String(f).padStart(5, '0')}.png`) });
      if (f % 90 === 0) process.stdout.write(`\r  frame ${f}/${total}`);
    }
    process.stdout.write('\n');
    const seg = join(tmpRoot, `${scene.id}.mp4`);
    execSync(`ffmpeg -y -v error -framerate ${fps} -i "${framesDir}/f%05d.png" ` +
      `-c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p "${seg}"`);
    segFiles.push(seg);
    console.log(`  ✓ segment: ${seg}`);
  }
  await browser.close();

  if (TEST_SHOTS) { console.log('\nTEST_SHOTS mode — no video assembled.'); return; }
  if (!segFiles.length) { console.error('No segments rendered.'); process.exit(1); }

  const listFile = join(tmpRoot, 'list.txt');
  writeFileSync(listFile, segFiles.map(s => `file '${s}'`).join('\n'));

  // ---- Transitions between scenes (ffmpeg xfade) ----
  const hasTransitions = renderedScenes.length > 1 &&
    renderedScenes.slice(1).some(s => normTransition(s.transition).type !== 'none');
  const starts = sceneStartTimes(renderedScenes, fps);
  const totalDur = starts.length
    ? starts[starts.length - 1] + renderedScenes[renderedScenes.length - 1].duration
    : 0;
  if (hasTransitions){
    console.log(`\n🎞️ Transitions: ${renderedScenes.slice(1).map((s,i)=>{
      const t = normTransition(s.transition);
      return `${renderedScenes[i].id}→${s.id}:${t.type}@${t.duration}s`;
    }).join(', ')}`);
    console.log(`   Final duration: ${totalDur.toFixed(2)}s (was ${renderedScenes.reduce((a,s)=>a+s.duration,0).toFixed(1)}s)`);
  }

  // ---- Audio: mix per-scene SFX (+ optional music) into one track ----
  const mixedAudio = buildMixedAudio(story, storyDir, tmpRoot, starts, totalDur, renderedScenes);

  const outAbs = resolve(process.cwd(), outPath);
  if (hasTransitions){
    assembleWithTransitions(segFiles, renderedScenes, mixedAudio, outAbs, fps, W, H, starts);
  } else if (mixedAudio) {
    execFileSync('ffmpeg', ['-y', '-v', 'error',
      '-f', 'concat', '-safe', '0', '-i', listFile,
      '-i', mixedAudio,
      '-c:v', 'copy', '-c:a', 'aac', '-shortest', outAbs],
      { stdio: 'inherit' });
  } else {
    execSync(`ffmpeg -y -v error -f concat -safe 0 -i "${listFile}" -c copy "${outAbs}"`);
  }
  console.log(`\n✅ Done: ${outPath}`);
}

/**
 * Join scene segments with xfade transitions.
 * Boundary i (i>=1): transition INTO renderedScenes[i], overlapping the
 * tail of the accumulated video by boundaryOverlap().
 * 'zoom' = zoompan (1.0x -> 1.6x) on the incoming head + fade blend.
 */
function assembleWithTransitions(segFiles, scenes, mixedAudio, outAbs, fps, W, H, starts){
  const args = ['-y', '-v', 'error'];
  segFiles.forEach(s => args.push('-i', s));
  let audioIdx = segFiles.length;
  if (mixedAudio) args.push('-i', mixedAudio);

  const fc = [];
  // Normalize timebases: concat outputs AVTB (1/1000000) while raw segments
  // may carry the container timebase — xfade requires both inputs to match.
  for (let i = 0; i < segFiles.length; i++) fc.push(`[${i}:v]settb=AVTB[s${i}]`);
  let last = '[s0]';
  let offset = scenes[0].duration;   // end-time of accumulated video so far
  for (let i = 1; i < segFiles.length; i++){
    const t = normTransition(scenes[i].transition);
    const td = t.type === 'none' ? 1 / fps : t.duration;
    const off = offset - td;
    if (t.type === 'zoom'){
      // zoom transition: incoming head zooms 1.6x -> 1.0x while fading in,
      // then the untouched tail of the scene continues (concat).
      const FR = Math.max(2, Math.round(td * fps));
      fc.push(
        `[s${i}]trim=0:${td.toFixed(4)},setpts=PTS-STARTPTS,` +
        `scale=w='iw*(1.6-0.6*n/${FR})':h=-2:eval=frame,` +
        `crop=${W}:${H}:x='(in_w-${W})/2':y='(in_h-${H})/2',setsar=1[zb${i}]`
      );
      fc.push(`[s${i}]trim=${td.toFixed(4)}:9999,setpts=PTS-STARTPTS[bt${i}]`);
      fc.push(`${last}[zb${i}]xfade=transition=fade:duration=${td.toFixed(4)}:offset=${off.toFixed(3)}[vx${i}]`);
      fc.push(`[vx${i}][bt${i}]concat=n=2:v=1:a=0[v${i}]`);
    } else {
      const xf = XFADE_MAP[t.type] || 'fade';
      const effTd = t.type === 'none' ? 1 / fps : t.duration;
      const effOff = offset - effTd;
      fc.push(`${last}[s${i}]xfade=transition=${xf}:duration=${effTd.toFixed(4)}:offset=${effOff.toFixed(3)}[v${i}]`);
    }
    last = `[v${i}]`;
    offset = offset + scenes[i].duration - td;
  }
  fc.push(`${last}format=yuv420p[vout]`);

  args.push('-filter_complex', fc.join(';'),
    '-map', '[vout]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-r', String(fps));
  if (mixedAudio){
    args.push('-map', `${audioIdx}:a`, '-c:a', 'aac', '-shortest');
  }
  args.push(outAbs);
  execFileSync('ffmpeg', args, { stdio: 'inherit' });
}

/**
 * Build a single mixed audio track for the whole story:
 *   - per-scene SFX clips: [{key, t0, volume(0-100), loop}] at absolute time
 *   - optional story.audio (music file) looped under everything at 40% volume
 * Returns path to a WAV file, or null if there is no audio at all.
 */
function buildMixedAudio(story, storyDir, tmpRoot, starts, totalDur, renderedScenes){
  const scenes = renderedScenes || story.scenes;
  const clips = [];
  scenes.forEach((scene, i)=>{
    const base = (starts && starts[i] != null) ? starts[i] : 0;
    for (const s of (scene.sfx || [])){
      if (!s || !s.key || !SFX_DUR[s.key]) continue;
      clips.push({
        key: s.key,
        at: base + Math.max(0, +s.t0 || 0),
        vol: Math.min(1, Math.max(0, (+s.volume ?? 80) / 100)),
        loop: !!s.loop,
        sceneRemain: scene.duration - Math.max(0, +s.t0 || 0),
      });
    }
  });
  totalDur = totalDur || scenes.reduce((a, s)=>a + s.duration, 0);
  const hasMusic = !!story.audio;
  if (!clips.length && !hasMusic) return null;

  const sfxDir = join(tmpRoot, 'sfx');
  mkdirSync(sfxDir, { recursive: true });

  const args = ['-y', '-v', 'error'];
  const fc = [];
  let idx = 0;

  for (const c of clips){
    const wav = ensureSfxWav(c.key, sfxDir);
    const natDur = SFX_DUR[c.key] || 2;
    if (c.loop){
      const plays = Math.max(1, Math.ceil(c.sceneRemain / natDur));
      if (plays > 1) args.push('-stream_loop', String(plays - 1));
    }
    args.push('-i', wav);
    const ms = Math.round(c.at * 1000);
    fc.push(`[${idx}:a]aresample=44100,adelay=${ms},volume=${c.vol.toFixed(3)},atrim=0:${totalDur.toFixed(2)}[a${idx}]`);
    idx++;
  }
  if (hasMusic){
    const audioAbs = isAbsolute(story.audio) ? story.audio : resolve(storyDir, story.audio);
    args.push('-stream_loop', '-1', '-i', audioAbs);
    fc.push(`[${idx}:a]aresample=44100,atrim=0:${totalDur.toFixed(2)},volume=0.4[mus]`);
    idx++;
  }
  const mixIns = clips.map((_, i)=>`[a${i}]`).join('') + (hasMusic ? '[mus]' : '');
  fc.push(`${mixIns}amix=inputs=${idx}:duration=longest:dropout_transition=0,aformat=channel_layouts=stereo[aout]`);
  args.push('-filter_complex', fc.join(';'), '-map', '[aout]', '-c:a', 'pcm_s16le', join(tmpRoot, 'mixed.wav'));
  execFileSync('ffmpeg', args, { stdio: 'inherit' });
  return join(tmpRoot, 'mixed.wav');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
