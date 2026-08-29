import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { writeWav, synthBGM } from './audio.mjs';

const sr = 44100;
const dur = 30.0;
const n = Math.ceil(dur * sr);
const bgm = synthBGM(dur, sr);

// Add acoustic urban rhythm + bell chime at t=18.5s + morning chord at t=22.5s
for(let i=0; i<n; i++){
  const t = i / sr;
  // Studio pencil scratch in Act 1 (0-4s)
  if(t < 4.0){
    const scratch = (Math.sin(2*Math.PI*2200*t) * Math.sin(t*40)) * 0.04;
    bgm[i] += scratch;
  }
  // Chase running rhythm in Act 2 (7.5-15s)
  if(t >= 7.5 && t <= 15.0){
    const beat = Math.sin(2*Math.PI*4*(t-7.5));
    if(beat > 0.85) bgm[i] += 0.12 * Math.sin(2*Math.PI*120*t);
  }
  // Chime at 18.5s (peace & heart)
  if(t >= 18.5 && t <= 22.5){
    const dt = t - 18.5;
    const chime = (Math.sin(2*Math.PI*1046.5*dt) + Math.sin(2*Math.PI*1567.98*dt)*0.5) * Math.exp(-dt*1.5) * 0.28;
    bgm[i] += chime;
  }
  // Dawn warm chord at 22.5s
  if(t >= 22.5 && t <= 29.5){
    const dt = t - 22.5;
    const dawn = (Math.sin(2*Math.PI*440*dt) + Math.sin(2*Math.PI*554.37*dt) + Math.sin(2*Math.PI*659.25*dt)) * Math.exp(-dt*0.6) * 0.22;
    bgm[i] += dawn;
  }
}

const wavPath = path.resolve('out/mannay_story/soundtrack.wav');
writeWav(fs, wavPath, bgm, sr);

const videoIn = path.resolve('out/mannay_story/anim.mp4');
const videoOut = path.resolve('out/mannay_story/sketchbook_metropolis_30s.mp4');

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

console.log('✓ Final Mannay story animation ready:', videoOut);
