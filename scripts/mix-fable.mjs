import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { writeWav, synthBGM } from './audio.mjs';

const sr = 44100;
const dur = 30.0;
const n = Math.ceil(dur * sr);
const bgm = synthBGM(dur, sr);

// Add wind in Act 1 (0-7s), chime at t=9.5s, bloom chord at t=14.5s
for(let i=0; i<n; i++){
  const t = i / sr;
  // Chime at 9.5s (star drop)
  if(t >= 9.5 && t <= 13.5){
    const dt = t - 9.5;
    const chime = (Math.sin(2*Math.PI*880*dt) + Math.sin(2*Math.PI*1320*dt)*0.5) * Math.exp(-dt*1.8) * 0.25;
    bgm[i] += chime;
  }
  // Bloom chord explosion at 14.5s
  if(t >= 14.5 && t <= 20.0){
    const dt = t - 14.5;
    const bloom = (Math.sin(2*Math.PI*523.25*dt) + Math.sin(2*Math.PI*659.25*dt) + Math.sin(2*Math.PI*783.99*dt)) * Math.exp(-dt*0.8) * 0.22;
    bgm[i] += bloom;
  }
}

const wavPath = path.resolve('out/fable_anim/soundtrack.wav');
writeWav(fs, wavPath, bgm, sr);

const videoIn = path.resolve('out/fable_anim/anim.mp4');
const videoOut = path.resolve('out/fable_anim/the_star_tree_30s.mp4');

execFileSync('ffmpeg', [
  '-y',
  '-i', videoIn,
  '-i', wavPath,
  '-c:v', 'copy',
  '-c:a', 'aac',
  '-b:a', '128k',
  '-shortest',
  videoOut
]);

console.log('✓ Final fable animation ready:', videoOut);
