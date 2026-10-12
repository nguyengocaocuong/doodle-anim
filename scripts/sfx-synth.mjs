#!/usr/bin/env node
// ============================================================================
// scripts/sfx-synth.mjs — Synthesize SFX presets to WAV using ffmpeg filters.
// Mirrors the Web Audio recipes in doodle-studio/js/sfx-engine.js so the
// browser preview and the server render sound the same.
//
// Usage:
//   node scripts/sfx-synth.mjs <key> <out.wav>     # one SFX
//   node scripts/sfx-synth.mjs --all <dir>         # all 52 presets
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
  chicken:2, cicada:5, buffalo:2.5, horse:1.8, crow:1.5,
  motorbike:3, bicycle:2, horn:0.8, boat:3.5,
  footstep:1, broom:1.5, splash:1.5, punch:0.6, thud:0.9, clap:1.2, cry:2.5, laugh:2,
  gallop:2, firecracker:3, fire:4, pour:2.5, chop:0.8, whisper:3, announce:2, tea:2.5,
  bell:3, magic:2, whoosh:2.5,
  crowd:5, drum:4, applause:3, nightquiet:6,
  mus_happy:4, mus_sad:4, mus_magic:4, mus_tense:4, mus_fest:4,
  mus_gentle:8, mus_spooky:8, mus_triumph:8, mus_longing:8,
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
  chicken:  { in: [[`aevalsrc=0.28*sin(2*PI*850*t)*pow(max(0\\,sin(2*PI*3.7*t))\\,16):s=${SR}:d=2`]], fc: `lowpass=f=1800` },
  cicada:   { in: [[`aevalsrc=0.035*sin(2*PI*5200*t)*(1+sin(2*PI*45*t))+0.015*sin(2*PI*4800*t)*(1+sin(2*PI*38*t)):s=${SR}:d=5`]], fc: `anull` },
  buffalo:  { in: [[`aevalsrc=0.30*sin(2*PI*(95*t-2*pow(t\\,2))+2.4*sin(2*PI*2.5*t))*(0.67+0.33*sin(2*PI*3*t))*min(1\\,t*5)*min(1\\,(2.5-t)*2):s=${SR}:d=2.5`]], fc: `lowpass=f=400` },
  horse:    { in: [[`aevalsrc=0.25*sin(2*PI*(500*t+278*pow(t\\,2))+11.4*sin(2*PI*7*t))*min(1\\,t*8)*min(1\\,(1.8-t)*3):s=${SR}:d=1.8`]], fc: `bandpass=f=1000` },
  crow:     { in: [[`aevalsrc=(0.30*sin(2*PI*(340*t-25*pow(t\\,2)))+0.10*sin(2*PI*(340*t-25*pow(t\\,2))+4.4))*pow(max(0\\,sin(2*PI*2.8*t))\\,10):s=${SR}:d=1.5`]], fc: `bandpass=f=900` },
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
  gallop:   { in: [[`aevalsrc=0.5*sin(2*PI*70*t)*(pow(max(0\\,sin(2*PI*2*t))\\,10)+pow(max(0\\,sin(2*PI*2*(t-0.13)))\\,10)+pow(max(0\\,sin(2*PI*2*(t-0.26)))\\,10)):s=${SR}:d=2`]], fc: `lowpass=f=300` },
  firecracker: { in: [[`anoisesrc=d=3:c=white:r=${SR}`],
                      [`anoisesrc=d=3:c=white:r=${SR}`]],
                fc: `[0:a]highpass=f=800,volume=0.45,tremolo=f=6.7:d=1,tremolo=f=9.1:d=1,tremolo=f=12.3:d=1[p];[1:a]lowpass=f=150,volume=0.30,tremolo=f=3.7:d=1[b];[p][b]amix=inputs=2:duration=first` },
  fire:     { in: [[`anoisesrc=d=4:c=pink:r=${SR}`],
                   [`anoisesrc=d=4:c=white:r=${SR}`]],
              fc: `[0:a]lowpass=f=500,volume=0.14,tremolo=f=0.5:d=0.4[r];[1:a]bandpass=f=2600,volume=0.10,tremolo=f=5.3:d=1,tremolo=f=8.9:d=1[c];[r][c]amix=inputs=2:duration=first` },
  pour:     { in: [[`anoisesrc=d=2.5:c=white:r=${SR}`],
                   [`aevalsrc=0.08*sin(2*PI*2800*t)*pow(max(0\\,sin(2*PI*7*t))\\,12):s=${SR}:d=2.5`]],
              fc: `[0:a]bandpass=f=3000,volume=0.35,afade=t=in:st=0:d=0.2,afade=t=out:st=2.1:d=0.4[n];[n][1:a]amix=inputs=2:duration=first` },
  chop:     { in: [[`aevalsrc=(0.4*sin(2*PI*180*t)+0.2*sin(2*PI*360*t)+0.25*sin(2*PI*90*t))*exp(-8*t):s=${SR}:d=0.8`],
                   [`anoisesrc=d=0.06:c=white:r=${SR}`]],
              fc: `[1:a]highpass=f=2000,volume=0.6[n];[0:a][n]amix=inputs=2:duration=first` },
  whisper:  { in: [[`anoisesrc=d=3:c=pink:r=${SR}`]], fc: `bandpass=f=1500,volume=0.07,tremolo=f=4:d=0.5` },
  announce: { in: [[`aevalsrc=tanh(2.2*0.25*(sin(2*PI*660*t)*between(t\\,0.1\\,0.5)+sin(2*PI*880*t)*between(t\\,0.6\\,1.1))):s=${SR}:d=2`]], fc: `bandpass=f=1400:width_type=h:w=2000,volume=0.9` },
  tea:      { in: [[`anoisesrc=d=2.5:c=white:r=${SR}`],
                   [`aevalsrc=0.06*sin(2*PI*(800*t+280*pow(t\\,2)))*min(1\\,t*6)*min(1\\,(2.5-t)*2):s=${SR}:d=2.5`]],
              fc: `[0:a]bandpass=f=1500,volume=0.22,afade=t=in:st=0:d=0.15,afade=t=out:st=2.1:d=0.4[n];[n][1:a]amix=inputs=2:duration=first` },
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
  mus_gentle:{ in: [[`aevalsrc=(0.07*(sin(2*PI*261.63*t)+sin(2*PI*329.63*t)+sin(2*PI*392*t)+sin(2*PI*493.88*t))*between(t\\,0\\,4.2)+0.07*(sin(2*PI*220*t)+sin(2*PI*261.63*t)+sin(2*PI*329.63*t)+sin(2*PI*392*t))*between(t\\,3.8\\,8))*min(1\\,t*1.5)*min(1\\,(8-t)*1.5):s=${SR}:d=8`]], fc: `anull` },
  mus_spooky:{ in: [[`aevalsrc=(0.05*sin(2*PI*110*t)+0.05*sin(2*PI*220*t)+0.05*sin(2*PI*261.63*t)+0.05*sin(2*PI*329.63*t)+0.03*sin(2*PI*466.16*t))*(0.65+0.35*sin(2*PI*3*t))*min(1\\,t)*min(1\\,(8-t)):s=${SR}:d=8`]], fc: `anull` },
  mus_triumph:{ in: [[`aevalsrc=(0.055*(sin(2*PI*261.63*t)+0.3*sin(2*PI*523.26*t)+0.15*sin(2*PI*784.89*t))+0.055*(sin(2*PI*329.63*t)+0.3*sin(2*PI*659.26*t)+0.15*sin(2*PI*988.89*t))+0.055*(sin(2*PI*392*t)+0.3*sin(2*PI*784*t)+0.15*sin(2*PI*1176*t))+0.06*sin(2*PI*130.81*t))*between(t\\,0\\,4.2):s=${SR}:d=4.2`],
                     [`aevalsrc=(0.055*(sin(2*PI*196*t)+0.3*sin(2*PI*392*t)+0.15*sin(2*PI*588*t))+0.055*(sin(2*PI*246.94*t)+0.3*sin(2*PI*493.88*t)+0.15*sin(2*PI*740.82*t))+0.055*(sin(2*PI*293.66*t)+0.3*sin(2*PI*587.32*t)+0.15*sin(2*PI*880.98*t))+0.06*sin(2*PI*98*t))*between(t\\,3.8\\,8):s=${SR}:d=8`]],
               fc: `[0:a]afade=t=in:st=0:d=0.3,afade=t=out:st=3.7:d=0.5,lowpass=f=1500[a];[1:a]afade=t=in:st=3.8:d=0.4,afade=t=out:st=7.4:d=0.6,lowpass=f=1500[b];[a][b]amix=inputs=2:duration=longest,tremolo=f=2:d=0.3` },
  mus_longing:{ in: [[`aevalsrc=0.05*(sin(2*PI*220*t)+sin(2*PI*261.63*t)+sin(2*PI*329.63*t))*min(1\\,t)*min(1\\,(8-t))+0.12*sin(2*PI*659.26*t+0.8*sin(2*PI*5.5*t))*between(t\\,0.5\\,2.5)*min(1\\,(t-0.5)*3)*min(1\\,(2.5-t)*2)+0.12*sin(2*PI*587.33*t+0.8*sin(2*PI*5.5*t))*between(t\\,2.5\\,4.5)*min(1\\,(t-2.5)*3)*min(1\\,(4.5-t)*2)+0.12*sin(2*PI*523.25*t+0.8*sin(2*PI*5.5*t))*between(t\\,4.5\\,7)*min(1\\,(t-4.5)*3)*min(1\\,(7-t)*2):s=${SR}:d=8`]], fc: `anull` },
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
