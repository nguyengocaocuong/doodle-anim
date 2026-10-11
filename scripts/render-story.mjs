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
//       "characters": [
//         {
//           "preset": "an",                        // built-in preset (see PRESETS)
//           "h": 290,                              // height px
//           "x": 540, "y": 880,                    // static position (if no moves)
//           "moves": [                             // timeline segments (optional)
//             { "m": "walk", "t0": 0, "t1": 4, "x0": -100, "y0": 880, "x1": 500, "y1": 880 },
//             { "m": "idle", "t0": 4, "t1": 10, "x0": 500, "y0": 880, "x1": 500, "y1": 880 }
//           ],
//           "dir": 1,
//           "attrs": { "clothC": "#ff0000" },      // override appearance
//           "seed": 42,
//           "emotes": [ { "what": "!", "t0": 4, "t1": 6 } ]   // ! ? ... heart sweat music
//         }
//       ]
//     }
//   ]
// }
// ============================================================================
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync, mkdtempSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join, resolve, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const TEMPLATES_DIR = join(REPO_ROOT, 'templates');

// ---- Built-in character presets (from doodle-anim character work) ----
const PRESETS = {
  an:   { skinC: '#f0d0b0', hairC: '#1a1a1a', hair: 'bowl',     clothC: '#6a9ab0', mouth: 'smile', eyeStyle: 'open', glasses: false, seed: 101 },
  binh: { skinC: '#e8b98a', hairC: '#6b3a26', hair: 'curly',    clothC: '#8aa860', mouth: 'smile', eyeStyle: 'open', glasses: false, seed: 102 },
  chi:  { skinC: '#fdf2ee', hairC: '#c9a25e', hair: 'pigtails', clothC: '#e8a0b0', mouth: 'smile', eyeStyle: 'open', glasses: false, seed: 103 },
  dung: { skinC: '#a06a42', hairC: '#1a1712', hair: 'afro',     clothC: '#e0a05a', mouth: 'smile', eyeStyle: 'open', glasses: false, seed: 104 },
};

// ---- Timeline with phase continuity (walk cycle doesn't jump between segs) ----
function makeTL(segs) {
  let phase = 0;
  const tl = [];
  for (const s of segs) {
    const dist = Math.hypot((s.x1 ?? 0) - (s.x0 ?? 0), (s.y1 ?? 0) - (s.y0 ?? 0));
    const dur = s.t1 - s.t0;
    const moving = s.m === 'walk' || s.m === 'run';
    const speed = moving ? Math.max(dist / Math.max(dur, 0.001), s.m === 'run' ? 60 : 40) : 0;
    tl.push({
      t0: s.t0, t1: s.t1, x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1,
      dir: s.dir ?? ((s.x1 ?? 0) >= (s.x0 ?? 0) ? 1 : -1),
      walk: s.m === 'walk', run: s.m === 'run', phase0: phase, speed,
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
function buildSceneHtml(scene, story, engineScripts, bgDataUrl, W, H) {
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
      const h = new Human(${seed}, { h: ${c.h || 290}, duration: ${dur}, W: ${W}, groundTop: ${gy}, groundBot: ${gy}, x0: ${W / 2} });
      Object.assign(h, ${JSON.stringify(attrs)});
      h.tl = ${JSON.stringify(tl)};
      h.emotes = [${emotes}];
      window.__chars.push(h);
    }`;
  }).join('\n');

  const cam = scene.cam || {};
  const camJs = `function(t){
    const d = ${dur};
    const lx = (a) => a ? a[0] + (a[1] - a[0]) * Math.min(1, t / d) : 0;
    const lz = (a) => a ? a[0] + (a[1] - a[0]) * Math.min(1, t / d) : 1;
    return { x: lx(${JSON.stringify(cam.x || null)}), y: lx(${JSON.stringify(cam.y || null)}), z: lz(${JSON.stringify(cam.z || null)}) };
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
const camFn = ${camJs};
const __bgColor = ${JSON.stringify(bgColor)};

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
  const ONLY = process.env.ONLY || null;
  const TEST_SHOTS = process.env.TEST_SHOTS === '1';

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', err => console.log('  PAGEERROR:', err.message));

  const tmpRoot = mkdtempSync(join(os.tmpdir(), 'doodle-story-'));
  const segFiles = [];

  for (const scene of story.scenes) {
    if (ONLY && scene.id !== ONLY) continue;
    console.log(`\n[scene ${scene.id}] ${scene.duration}s ...`);

    let bgDataUrl = null;
    if (scene.background && scene.background.image) {
      const p = resolveBgImage(scene.background.image, storyDir);
      const buf = readFileSync(p);
      bgDataUrl = `data:image/png;base64,${buf.toString('base64')}`;
      console.log(`  bg image: ${p} (${buf.length} bytes)`);
    }

    await page.goto('about:blank');   // reset JS realm between scenes
    await page.setContent(buildSceneHtml(scene, story, engineScripts, bgDataUrl, W, H));
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
  let cmd = `ffmpeg -y -v error -f concat -safe 0 -i "${listFile}" -c copy "${resolve(process.cwd(), outPath)}"`;
  if (story.audio) {
    const audioAbs = isAbsolute(story.audio) ? story.audio : resolve(storyDir, story.audio);
    cmd = `ffmpeg -y -v error -f concat -safe 0 -i "${listFile}" -i "${audioAbs}" ` +
      `-c:v copy -c:a aac -shortest "${resolve(process.cwd(), outPath)}"`;
  }
  execSync(cmd);
  console.log(`\n✅ Done: ${outPath}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
