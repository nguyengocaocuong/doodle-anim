#!/usr/bin/env node
// ============================================================================
// scripts/sfx-synth.mjs — Synthesize SFX presets to WAV using ffmpeg filters.
// Mirrors the Web Audio recipes in doodle-studio/js/sfx-engine.js so the
// browser preview and the server render sound the same.
//
// Usage:
//   node scripts/sfx-synth.mjs <key> <out.wav>     # one SFX
//   node scripts/sfx-synth.mjs --all <dir>         # all 33 presets
//
// Imported by render-story.mjs via ensureSfxWav().
// ============================================================================
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;

export const SFX_DUR = {
  rain:3, drizzle:3, thunder:2.2, wind:4, waves:5, stream:4,
  bird:2.5, frog:1.8, rooster:1.5, dog:1.2, cricket:4,
  motorbike:3, bicycle:2, horn:0.8, boat:3.5,
  footstep:1, broom:1.5, splash:1.5, punch:0.6, thud:0.9, clap:1.2, cry:2.5, laugh:2,
  bell:3, magic:2, whoosh:2.5,
  crowd:5, drum:4, applause:3, nightquiet:6,
  mus_happy:4, mus_sad:4, mus_magic:4, mus_tense:4, mus_fest:4,
};

// Each recipe: { inputs: [[...lavfiArgs]...], fc: filter_complex, map }
// inputs are arrays like ['-f','lavfi','-i','anoisesrc=...']
const RECIPES = {
  rain:     { in: [[`anoisesrc=d=3:c=white:r=${SR}`]], fc: `lowpass=f=4000,volume=0.35` },
  drizzle:  { in: [[`anoisesrc=d=3:c=white:r=${SR}`]], fc: `lowpass=f=2500,volume=0.20` },
  thunder:  { in: [[`anoisesrc=d=2.2:c=pink:r=${SR}`]], fc: `lowpass=f=120,volume=0.9,afade=t=out:st=0:d=2.2` },
  wind:     { in: [[`anoisesrc=d=4:c=white:r=${SR}`]], fc: `bandpass=f=800,volume=0.3,tremolo=f=0.4:d=0.5` },
  waves:    { in: [[`anoisesrc=d=5:c=white:r=${SR}`]], fc: `bandpass=f=400,volume=0.35,tremolo=f=0.15:d=0.8` },
  stream:   { in: [[`anoisesrc=d=4:c=white:r=${SR}`]], fc: `bandpass=f=900,volume=0.3` },
  bird:     { in: [[`aevalsrc=0.25*sin(2*PI*(2600+700*sin(2*PI*4*t))*t)*pow(max(0\\,sin(2*PI*2.2*t))\\,3):s=${SR}:d=2.5`]], fc: `anull` },
  frog:     { in: [[`aevalsrc=0.22*sin(2*PI*105*t)*pow(max(0\\,sin(2*PI*3.3*t))\\,2):s=${SR}:d=1.8`]], fc: `lowpass=f=500` },
  rooster:  { in: [[`aevalsrc=0.20*sin(2*PI*(500+1200*t-600*pow(t/1.5\\,2))*t):s=${SR}:d=1.5`]], fc: `bandpass=f=1200` },
  dog:      { in: [[`aevalsrc=0.35*sin(2*PI*180*t)*pow(max(0\\,sin(2*PI*2.6*t))\\,5):s=${SR}:d=1.2`]], fc: `lowpass=f=900` },
  cricket:  { in: [[`aevalsrc=0.05*sin(2*PI*4200*t)*pow(max(0\\,sin(2*PI*6*t))\\,8):s=${SR}:d=4`]], fc: `anull` },
  motorbike:{ in: [[`aevalsrc=0.25*sin(2*PI*(70+20*t)*t):s=${SR}:d=3`],
                   [`anoisesrc=d=3:c=white:r=${SR}`]],
              fc: `[1:a]highpass=f=2000,volume=0.08[n];[0:a][n]amix=inputs=2:duration=first` },
  bicycle:  { in: [[`aevalsrc=0.10*sin(2*PI*300*t)*pow(max(0\\,sin(2*PI*4*t))\\,6):s=${SR}:d=2`]], fc: `anull` },
  horn:     { in: [[`aevalsrc=0.15*(sin(2*PI*350*t)+sin(2*PI*440*t)):s=${SR}:d=0.8`]], fc: `anull` },
  boat:     { in: [[`anoisesrc=d=3.5:c=white:r=${SR}`]], fc: `bandpass=f=600,volume=0.3,tremolo=f=2:d=0.7` },
  footstep: { in: [[`aevalsrc=0.5*sin(2*PI*70*t)*pow(max(0\\,sin(2*PI*4*t))\\,4):s=${SR}:d=1`]], fc: `anull` },
  broom:    { in: [[`anoisesrc=d=1.5:c=white:r=${SR}`]], fc: `bandpass=f=2500,volume=0.25,tremolo=f=4:d=0.6` },
  splash:   { in: [[`anoisesrc=d=1.5:c=white:r=${SR}`]], fc: `bandpass=f=1200,volume=0.4,afade=t=out:st=0:d=1.5` },
  punch:    { in: [[`aevalsrc=0.7*sin(2*PI*(150-180*t)*t)*exp(-8*t):s=${SR}:d=0.6`],
                   [`anoisesrc=d=0.15:c=white:r=${SR}`]],
              fc: `[1:a]highpass=f=1500,volume=0.3[n];[0:a][n]amix=inputs=2:duration=first` },
  thud:     { in: [[`aevalsrc=0.7*sin(2*PI*(100-65*t)*t)*exp(-5*t):s=${SR}:d=0.9`]], fc: `anull` },
  clap:     { in: [[`anoisesrc=d=1.2:c=white:r=${SR}`]], fc: `bandpass=f=2000,volume=0.4,tremolo=f=4.5:d=0.5` },
  applause: { in: [[`anoisesrc=d=3:c=white:r=${SR}`]], fc: `bandpass=f=2000,volume=0.15,tremolo=f=9:d=0.4` },
  cry:      { in: [[`aevalsrc=0.18*sin(2*PI*(700-250*pow(max(0\\,sin(2*PI*1.25*t))\\,1))*t)*pow(max(0\\,sin(2*PI*1.25*t))\\,2):s=${SR}:d=2.5`]], fc: `anull` },
  laugh:    { in: [[`aevalsrc=0.20*sin(2*PI*350*t)*pow(max(0\\,sin(2*PI*4.5*t))\\,4):s=${SR}:d=2`]], fc: `bandpass=f=1000` },
  bell:     { in: [[`aevalsrc=(0.25*sin(2*PI*523*t)+0.12*sin(2*PI*784*t)+0.08*sin(2*PI*1046*t)+0.04*sin(2*PI*1568*t))*exp(-1.5*t):s=${SR}:d=3`]], fc: `anull` },
  magic:    { in: [[`aevalsrc=0.15*sin(2*PI*(200+1400*t)*t)*sin(2*PI*0.5*t):s=${SR}:d=2`]], fc: `anull` },
  whoosh:   { in: [[`aevalsrc=0.15*sin(2*PI*(200-50*t)*t)*sin(2*PI*0.4*t):s=${SR}:d=2.5`]], fc: `anull` },
  crowd:    { in: [[`anoisesrc=d=5:c=pink:r=${SR}`]], fc: `bandpass=f=800,volume=0.25,tremolo=f=1.7:d=0.6` },
  drum:     { in: [[`aevalsrc=0.6*sin(2*PI*(120-75*pow(max(0\\,sin(2*PI*2*t))\\,1))*t)*pow(max(0\\,sin(2*PI*2*t))\\,8):s=${SR}:d=4`]], fc: `anull` },
  nightquiet:{ in: [[`aevalsrc=0.02*sin(2*PI*4200*t)*pow(max(0\\,sin(2*PI*1.3*t))\\,8):s=${SR}:d=6`]], fc: `anull` },
  mus_happy:{ in: [[`aevalsrc=(0.08*sin(2*PI*261*t)+0.08*sin(2*PI*329*t)+0.08*sin(2*PI*392*t))*min(1\\,t*2)*min(1\\,(4-t)*2):s=${SR}:d=4`]], fc: `anull` },
  mus_sad:  { in: [[`aevalsrc=(0.08*sin(2*PI*220*t)+0.08*sin(2*PI*261*t)+0.08*sin(2*PI*329*t))*min(1\\,t*2)*min(1\\,(4-t)*2):s=${SR}:d=4`]], fc: `anull` },
  mus_magic:{ in: [[`aevalsrc=(0.08*sin(2*PI*329*t)+0.08*sin(2*PI*415*t)+0.08*sin(2*PI*493*t))*min(1\\,t*2)*min(1\\,(4-t)*2):s=${SR}:d=4`]], fc: `anull` },
  mus_tense:{ in: [[`aevalsrc=(0.08*sin(2*PI*196*t)+0.08*sin(2*PI*207*t)+0.08*sin(2*PI*261*t))*min(1\\,t*2)*min(1\\,(4-t)*2):s=${SR}:d=4`]], fc: `anull` },
  mus_fest: { in: [[`aevalsrc=(0.08*sin(2*PI*392*t)+0.08*sin(2*PI*494*t)+0.08*sin(2*PI*587*t))*min(1\\,t*2)*min(1\\,(4-t)*2):s=${SR}:d=4`]], fc: `anull` },
};

export function synthSfx(key, outPath){
  const r = RECIPES[key];
  if (!r) throw new Error(`Unknown SFX key: ${key}`);
  mkdirSync(dirname(outPath), { recursive: true });
  const args = ['-y', '-v', 'error'];
  for (const inp of r.in) args.push('-f', 'lavfi', '-i', inp[0]);
  args.push('-filter_complex', r.fc, '-c:a', 'pcm_s16le', '-ar', String(SR), outPath);
  execFileSync('ffmpeg', args, { stdio: 'inherit' });
  return outPath;
}

/** Generate (if missing) and return the cached WAV path for a key. */
export function ensureSfxWav(key, cacheDir){
  const out = join(cacheDir, `${key}.wav`);
  if (!existsSync(out)) synthSfx(key, out);
  return out;
}

// CLI
const here = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] === fileURLToPath(import.meta.url)){
  const [,, a, b] = process.argv;
  if (a === '--all' && b){
    mkdirSync(b, { recursive: true });
    for (const k of Object.keys(RECIPES)){
      console.log('synth', k);
      synthSfx(k, join(b, `${k}.wav`));
    }
    console.log(`✅ ${Object.keys(RECIPES).length} SFX -> ${b}`);
  } else if (a && b){
    synthSfx(a, b);
    console.log(`✅ ${a} -> ${b}`);
  } else {
    console.error('Usage: sfx-synth.mjs <key> <out.wav> | sfx-synth.mjs --all <dir>');
    process.exit(1);
  }
}
