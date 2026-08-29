import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { writeWav } from './audio.mjs';

const sr = 44100;
const dur = 30.0;
const n = Math.ceil(dur * sr);
const samples = new Float32Array(n);

// Seeded noise generator
function makeRand(seed){
  let s = seed >>> 0;
  return ()=>{ s = (s*1103515245 + 12345) & 0x7fffffff; return s/0x3fffffff - 1; };
}
const rand = makeRand(42);

// Synthesis Helpers
function addTone(freq, tStart, tDur, amp, type='sine', decay=3.0){
  const i0 = Math.floor(tStart * sr);
  const i1 = Math.min(n, Math.floor((tStart + tDur) * sr));
  for(let i=i0; i<i1; i++){
    const t = (i - i0) / sr;
    const env = Math.exp(-t * decay) * Math.min(1, t*150);
    let v = 0;
    if(type === 'sine'){
      v = Math.sin(2 * Math.PI * freq * t) + 0.3 * Math.sin(2 * Math.PI * freq * 2 * t);
    } else if(type === 'pluck'){
      v = Math.sin(2 * Math.PI * freq * t) + 0.5 * Math.sin(2 * Math.PI * freq * 3 * t) + 0.25 * Math.sin(2 * Math.PI * freq * 4 * t);
    } else if(type === 'bell'){
      v = Math.sin(2 * Math.PI * freq * t) + 0.6 * Math.sin(2 * Math.PI * freq * 2.76 * t) + 0.3 * Math.sin(2 * Math.PI * freq * 5.4 * t);
    }
    samples[i] += v * amp * env;
  }
}

function addPercussion(tStart, type='kick'){
  const i0 = Math.floor(tStart * sr);
  const tDur = type === 'kick' ? 0.35 : 0.15;
  const i1 = Math.min(n, Math.floor((tStart + tDur) * sr));
  for(let i=i0; i<i1; i++){
    const t = (i - i0) / sr;
    if(type === 'kick'){
      const f = 140 * Math.exp(-t * 22) + 40;
      const v = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 12);
      samples[i] += v * 0.45;
    } else if(type === 'snare'){
      const noise = rand() * Math.exp(-t * 28);
      const tone = Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t * 25);
      samples[i] += (noise*0.7 + tone*0.3) * 0.35;
    }
  }
}

console.log('Synthesizing cinematic 4-act multi-instrument soundtrack...');

// --- ACT 1 [0.0 - 6.5s]: Mystery & Friction Ostinato ---
for(let t=0; t<6.5; t+=0.4){
  // Ticking bass ostinato (D2 - F2 - G2 - A2)
  const notes = [73.42, 87.31, 98.00, 110.00];
  const f = notes[Math.floor(t * 2.5) % notes.length];
  addTone(f, t, 0.35, 0.35, 'pluck', 6.0);
  // Charcoal scratch bursts
  const i0 = Math.floor(t * sr);
  for(let k=0; k<1200; k++){
    if(i0+k < n) samples[i0+k] += rand() * 0.04;
  }
}
// Magical chime at 3.5s (sprite awakes)
addTone(880, 3.5, 2.0, 0.4, 'bell', 2.0);
addTone(1320, 3.7, 2.0, 0.3, 'bell', 2.5);

// --- ACT 2 [6.5 - 14.5s]: High-Octane Action Chase ---
// Crash impact at 6.5s
addPercussion(6.5, 'kick');
addPercussion(6.52, 'snare');
for(let t=6.5; t<14.5; t+=0.25){
  const beat = Math.round((t - 6.5) * 4);
  if(beat % 2 === 0){
    addPercussion(t, 'kick');
    addTone(65.41, t, 0.25, 0.4, 'pluck', 8.0); // C2 punch
  } else {
    addPercussion(t, 'snare');
    addTone(130.81, t, 0.2, 0.3, 'pluck', 10.0);
  }
  // Fast running arpeggio
  const arp = [261.63, 329.63, 392.00, 523.25];
  addTone(arp[beat % arp.length], t, 0.2, 0.18, 'sine', 12.0);
}

// --- ACT 3 [14.5 - 22.0s]: Sudden Intimate Drop & Music-Box Melody ---
// Wind rush into silence at 14.5s
addTone(440, 14.8, 3.0, 0.25, 'bell', 1.5);
// Tender Music-Box Melody (D major: F# - A - D - E - C# - D)
const tenderMelody = [
  { t: 15.5, f: 739.99, d: 0.8 }, // F#5
  { t: 16.3, f: 880.00, d: 0.8 }, // A5
  { t: 17.1, f: 1174.66, d: 1.2 }, // D6
  { t: 18.2, f: 659.25, d: 0.8 }, // E5
  { t: 19.0, f: 587.33, d: 0.8 }, // D5 (Croissant offered)
  { t: 19.8, f: 739.99, d: 1.0 }, // F#5
  { t: 20.8, f: 880.00, d: 1.5 }  // A5 (Bite & Heart)
];
tenderMelody.forEach(({t, f, d})=>{
  addTone(f, t, d, 0.35, 'bell', 2.0);
  addTone(f/2, t, d, 0.2, 'sine', 1.5);
});
// Warm Cello baseline pad
for(let t=15.0; t<22.0; t+=1.5){
  addTone(146.83, t, 2.0, 0.18, 'sine', 0.8); // D3
}

// --- ACT 4 [22.0 - 30.0s]: Grand Orchestral Sunrise Finale ---
// Sunrise Chords: G -> D -> Em -> C -> G
const chords = [
  { t: 22.2, notes: [196.00, 246.94, 293.66, 392.00] }, // G maj
  { t: 24.0, notes: [146.83, 220.00, 293.66, 370.00] }, // D maj
  { t: 25.8, notes: [164.81, 196.00, 246.94, 329.63] }, // Em
  { t: 27.6, notes: [130.81, 196.00, 261.63, 329.63] }, // C maj
  { t: 29.0, notes: [196.00, 293.66, 392.00, 587.33] }  // G epic finish
];
chords.forEach(({t, notes})=>{
  notes.forEach(f => addTone(f, t, 2.8, 0.22, 'sine', 0.7));
  addPercussion(t, 'kick');
});
// Soaring Top Bells & Shimmer
for(let t=22.5; t<29.5; t+=0.3){
  const pentatonic = [587.33, 659.25, 783.99, 880.00, 1046.50];
  const f = pentatonic[Math.floor(t*4) % pentatonic.length];
  addTone(f, t, 0.4, 0.12, 'bell', 4.0);
}

// Master limiter
for(let i=0; i<n; i++){
  samples[i] = Math.max(-0.95, Math.min(0.95, samples[i]));
}

const wavOut = path.resolve('out/cinematic_fable/soundtrack.wav');
fs.mkdirSync(path.dirname(wavOut), { recursive: true });
writeWav(fs, wavOut, samples, sr);
console.log('✓ Soundtrack written:', wavOut);

const videoIn = path.resolve('out/cinematic_fable/anim.mp4');
const videoOut = path.resolve('out/cinematic_fable/the_heist_of_ink_30s.mp4');

if(fs.existsSync(videoIn)){
  execFileSync('ffmpeg', [
    '-y',
    '-i', videoIn,
    '-i', wavOut,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    videoOut
  ]);
  console.log('✓ Final Cinematic Film ready:', videoOut);
}
