// audio.mjs — procedural BGM + SFX synthesis for the explainer pipeline.
// Pure PCM, zero dependencies. Voice (TTS) stays the star; these are a
// quiet lo-fi bed and small event sounds keyed to scene beats.

/* ---------- WAV writer (16-bit mono PCM) ---------- */
export function writeWav(fs, file, samples, sr = 44100){
  const n = samples.length;
  const buf = Buffer.alloc(44 + n*2);
  buf.write('RIFF', 0);  buf.writeUInt32LE(36 + n*2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);              // PCM
  buf.writeUInt16LE(1, 22);              // mono
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr*2, 28);
  buf.writeUInt16LE(2, 32);  buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n*2, 40);
  for(let i=0;i<n;i++){
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v*32767), 44 + i*2);
  }
  fs.writeFileSync(file, buf);
}

function makeRand(seed){
  let s = seed >>> 0;
  return ()=>{ s = (s*1103515245 + 12345) & 0x7fffffff; return s/0x3fffffff - 1; };
}

/* ---------- BGM: slow lo-fi pad (Am F C G) + airy noise ---------- */
export function synthBGM(dur, sr = 44100){
  const chords = [
    [220.00, 261.63, 329.63],   // Am
    [174.61, 220.00, 261.63],   // F
    [130.81, 196.00, 261.63],   // C
    [196.00, 246.94, 293.66],   // G
  ];
  const chordDur = 4.0;
  const n = Math.ceil(dur*sr);
  const out = new Float32Array(n);
  for(let i=0;i<n;i++){
    const t = i/sr;
    const ci = Math.floor(t/chordDur) % chords.length;
    const ct = t % chordDur;
    const env = Math.min(1, ct/1.2) * Math.min(1, (chordDur-ct)/1.2);
    let v = 0;
    for(const f of chords[ci])
      v += Math.sin(2*Math.PI*f*t)*0.5 + Math.sin(2*Math.PI*f*2.003*t)*0.16;
    out[i] = v*env*0.15;
  }
  // airy noise bed through a one-pole lowpass
  const rand = makeRand(7);
  let lp = 0;
  for(let i=0;i<n;i++){
    lp += 0.02*(rand()-lp);
    out[i] += lp*0.4;
  }
  return out;
}

/* ---------- SFX: one combined track, events at absolute times ----------
 * timeline: [{ visual, t0, dur }] — events keyed to each scene's beats. */
export function synthSFX(timeline, sr = 44100){
  const total = timeline.length ? timeline[timeline.length-1].t0 + timeline[timeline.length-1].dur : 0;
  const out = new Float32Array(Math.ceil(total*sr));
  const rand = makeRand(13);
  const add = (t0, dur, fn)=>{
    const s0 = Math.floor(t0*sr), m = Math.floor(dur*sr);
    for(let k=0;k<m && s0+k<out.length;k++) out[s0+k] += fn(k/sr, k/m);
  };
  const zap     = t0      => add(t0, 0.16, (tt,u)=> (Math.sign(Math.sin(2*Math.PI*(900-4000*tt)*tt))*0.4 + rand()*0.4) * (1-u)*(1-u)*0.5);
  const pop     = t0      => add(t0, 0.09, (tt,u)=> Math.sin(2*Math.PI*(520-300*u)*tt)*(1-u)*(1-u)*0.8);
  const step    = t0      => { let lp=0; add(t0, 0.09, (tt,u)=>{ lp += 0.25*(rand()-lp); return lp*(1-u)*1.2; }); };
  const crumble = t0      => { let lp=0; add(t0, 0.35, (tt,u)=>{ lp += 0.12*(rand()-lp); return lp*Math.pow(1-u,1.5)*1.4; }); };
  const pling   = (t0,f)  => add(t0, 0.5, (tt,u)=> (Math.sin(2*Math.PI*f*tt) + 0.4*Math.sin(4*Math.PI*f*tt)) * Math.pow(1-u,2)*0.5);
  const shimmer = t0      => { pling(t0, 880); pling(t0+0.12, 1174.66); pling(t0+0.24, 1567.98); };
  const whoosh  = t0      => { let lp=0; add(t0, 0.45, (tt,u)=>{ lp += (0.04+0.3*Math.sin(u*Math.PI))*(rand()-lp); return lp*Math.sin(u*Math.PI)*1.6; }); };

  for(const sc of timeline){
    const at = u => sc.t0 + u*sc.dur;
    switch(sc.visual){
      case 'bedroom': step(at(0.08)); step(at(0.18)); step(at(0.28)); pop(at(0.46)); break;
      case 'crib':    pling(at(0.15), 660); pling(at(0.45), 880); pling(at(0.75), 740); break;
      case 'photos':  crumble(at(0.57)); crumble(at(0.65)); crumble(at(0.73)); break;
      case 'brain':   for(let tt=0; tt<sc.dur; tt+=1.7) zap(sc.t0+tt); break;   // matches the spark cycle
      case 'neurons': shimmer(at(0.68)); break;
      case 'mirror':  shimmer(at(0.35)); break;
      case 'endcard': pling(at(0.25), 523.25); break;
      case 'park':    step(at(0.10)); step(at(0.22)); step(at(0.33)); pling(at(0.62), 880); break;
      case 'street':  whoosh(at(0.32)); break;
      case 'space':   shimmer(at(0.58)); break;
      case 'lab':     pling(at(0.30), 990); pling(at(0.65), 1180); break;
      default: break;
    }
  }
  return out;
}
