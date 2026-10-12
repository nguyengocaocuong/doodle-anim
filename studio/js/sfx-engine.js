/* ============================================================================
   js/sfx-engine.js — SFXEngine: Web Audio synthesized sound effects for
   Doodle Studio. No audio files needed — all 52 presets are synthesized
   live with oscillators + filtered noise.

   Usage:
     const sfx = new SFXEngine();
     sfx.preview('rain', btnEl);        // toggle play, updates button UI
     const h = sfx.play('bird', 0.8);   // play at volume 0-1, returns handle
     h.stop();
     sfx.stopAll();
   ============================================================================ */
'use strict';

const SFX_CATALOG = [
  {id:'nature',  name:'🌧️ Thiên nhiên', items:[
    {n:'Mưa rào', d:'3.0s • loop', k:'rain', loop:true},
    {n:'Mưa lốp đốp (nhẹ)', d:'3.0s • loop', k:'drizzle', loop:true},
    {n:'Sấm sét', d:'2.2s', k:'thunder'},
    {n:'Gió thổi', d:'4.0s • loop', k:'wind', loop:true},
    {n:'Sóng biển', d:'5.0s • loop', k:'waves', loop:true},
    {n:'Suối chảy', d:'4.0s • loop', k:'stream', loop:true},
  ]},
  {id:'animals', name:'🐾 Động vật', items:[
    {n:'Chim hót', d:'2.5s', k:'bird'},
    {n:'Ếch kêu', d:'1.8s', k:'frog'},
    {n:'Gà gáy', d:'1.5s', k:'rooster'},
    {n:'Chó sủa', d:'1.2s', k:'dog'},
    {n:'Dế kêu (đêm)', d:'4.0s • loop', k:'cricket', loop:true},
    {n:'Gà cục tác', d:'2.0s', k:'chicken'},
    {n:'Ve sầu', d:'5.0s • loop', k:'cicada', loop:true},
    {n:'Trâu rống', d:'2.5s', k:'buffalo'},
    {n:'Ngựa hí', d:'1.8s', k:'horse'},
    {n:'Quạ kêu', d:'1.5s', k:'crow'},
  ]},
  {id:'vehicle', name:'🛵 Phương tiện', items:[
    {n:'Xe máy chạy', d:'3.0s', k:'motorbike'},
    {n:'Xe đạp', d:'2.0s', k:'bicycle'},
    {n:'Còi xe', d:'0.8s', k:'horn'},
    {n:'Thuyền chèo', d:'3.5s • loop', k:'boat', loop:true},
  ]},
  {id:'action',  name:'👊 Hành động', items:[
    {n:'Bước chân', d:'1.0s', k:'footstep'},
    {n:'Chổi quét', d:'1.5s', k:'broom'},
    {n:'Nước bì bõm', d:'1.5s', k:'splash'},
    {n:'Đấm mạnh', d:'0.6s', k:'punch'},
    {n:'Ngã', d:'0.9s', k:'thud'},
    {n:'Vỗ tay', d:'1.2s', k:'clap'},
    {n:'Khóc', d:'2.5s', k:'cry'},
    {n:'Cười', d:'2.0s', k:'laugh'},
    {n:'Vó ngựa', d:'2.0s • loop', k:'gallop', loop:true},
    {n:'Pháo nổ', d:'3.0s', k:'firecracker'},
    {n:'Lửa cháy', d:'4.0s • loop', k:'fire', loop:true},
    {n:'Đổ thóc', d:'2.5s', k:'pour'},
    {n:'Rìu chặt', d:'0.8s', k:'chop'},
    {n:'Xì xào', d:'3.0s • loop', k:'whisper', loop:true},
    {n:'Loa phóng thanh', d:'2.0s', k:'announce'},
    {n:'Rót trà', d:'2.5s', k:'tea'},
    {n:'Nhả khói thuốc', d:'1.2s', k:'smoke-puff'},
  ]},
  {id:'magic',   name:'✨ Huyền ảo', items:[
    {n:'Chuông ngân', d:'3.0s', k:'bell'},
    {n:'Phép thuật', d:'2.0s', k:'magic'},
    {n:'Gió thần', d:'2.5s', k:'whoosh'},
  ]},
  {id:'crowd',   name:'👥 Đám đông', items:[
    {n:'Chợ ồn ào', d:'5.0s • loop', k:'crowd', loop:true},
    {n:'Trống hội', d:'4.0s • loop', k:'drum', loop:true},
    {n:'Vỗ tay đám đông', d:'3.0s', k:'applause'},
    {n:'Yên tĩnh đêm khuya', d:'6.0s • loop', k:'nightquiet', loop:true},
  ]},
  {id:'music',   name:'🎵 Nhạc nền', items:[
    {n:'Vui tươi', d:'loop', k:'mus_happy', loop:true},
    {n:'Buồn', d:'loop', k:'mus_sad', loop:true},
    {n:'Huyền ảo', d:'loop', k:'mus_magic', loop:true},
    {n:'Hồi hộp', d:'loop', k:'mus_tense', loop:true},
    {n:'Lễ hội', d:'loop', k:'mus_fest', loop:true},
    {n:'Dịu dàng', d:'loop', k:'mus_gentle', loop:true},
    {n:'Ma mị', d:'loop', k:'mus_spooky', loop:true},
    {n:'Chiến thắng', d:'loop', k:'mus_triumph', loop:true},
    {n:'Nhớ nhung', d:'loop', k:'mus_longing', loop:true},
  ]},
];

// key -> natural duration (seconds), used for timeline blocks
const SFX_DUR = {
  rain:3, drizzle:3, thunder:2.2, wind:4, waves:5, stream:4,
  bird:2.5, frog:1.8, rooster:1.5, dog:1.2, cricket:4,
  chicken:2, cicada:5, buffalo:2.5, horse:1.8, crow:1.5,
  motorbike:3, bicycle:2, horn:0.8, boat:3.5,
  footstep:1, broom:1.5, splash:1.5, punch:0.6, thud:0.9, clap:1.2, cry:2.5, laugh:2,
  gallop:2, firecracker:3, fire:4, pour:2.5, chop:0.8, whisper:3, announce:2, tea:2.5, "smoke-puff":1.2,
  bell:3, magic:2, whoosh:2.5,
  crowd:5, drum:4, applause:3, nightquiet:6,
  mus_happy:4, mus_sad:4, mus_magic:4, mus_tense:4, mus_fest:4,
  mus_gentle:8, mus_spooky:8, mus_triumph:8, mus_longing:8,
};

class SFXEngine {
  constructor(){
    this._ac = null;
    this._active = new Set();   // stop-handles
    this._previewBtn = null;
    this._previewStop = null;
  }
  _ctx(){
    if (!this._ac) this._ac = new (window.AudioContext || window.webkitAudioContext)();
    if (this._ac.state === 'suspended') this._ac.resume();
    return this._ac;
  }
  static info(key){
    for (const c of SFX_CATALOG) for (const it of c.items) if (it.k === key) return it;
    return null;
  }
  static duration(key){ return SFX_DUR[key] || 2; }

  _noiseBuf(c, dur){
    const b = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  /** Synthesize `key` into `dest` node starting at time `t0`.
   *  Returns {dur, stop()} — stop() halts scheduled sources early. */
  _synth(c, key, dest, t0){
    const t = t0;
    const N = (dur)=>{ const s=c.createBufferSource(); s.buffer=this._noiseBuf(c,dur); return s; };
    const G = (v)=>{ const g=c.createGain(); g.gain.value=v; return g; };
    const F = (type,freq,q)=>{ const f=c.createBiquadFilter(); f.type=type; f.frequency.value=freq; f.Q.value=q||1; return f; };
    const O = (type,freq)=>{ const o=c.createOscillator(); o.type=type; o.frequency.value=freq; return o; };
    let dur = 2;
    const srcs = [];
    const start=(s,when=0,d)=>{ s.connect(dest); s.start(t+when); if(d) s.stop(t+when+d); srcs.push(s); };
    const startF=(s,f,g,when=0,d)=>{ s.connect(f); f.connect(g); g.connect(dest); s.start(t+when); if(d) s.stop(t+when+d); srcs.push(s); };

    switch(key){
      case 'rain': case 'drizzle': {
        dur = 3;
        const n=N(dur), f=F('lowpass', key==='rain'?4000:2500), g=G(key==='rain'?0.35:0.18);
        startF(n,f,g,0,dur);
        for(let i=0;i<40;i++){ const o=O('sine', 1800+Math.random()*2500), og=G(0);
          og.gain.setValueAtTime(0.06,t+Math.random()*dur); og.gain.exponentialRampToValueAtTime(0.0001,t+Math.random()*dur+0.08);
          o.connect(og); og.connect(dest); o.start(t+Math.random()*dur); o.stop(t+dur); srcs.push(o); }
        break; }
      case 'thunder': {
        dur=2.2; const n=N(dur), f=F('lowpass',120), g=G(0.9);
        g.gain.setValueAtTime(0.9,t); g.gain.exponentialRampToValueAtTime(0.001,t+dur);
        startF(n,f,g,0,dur); break; }
      case 'wind': case 'waves': case 'stream': {
        dur = key==='waves'?5:4; const n=N(dur), f=F('bandpass', key==='waves'?400:800, 0.6), g=G(0.3);
        const lfo=O('sine', key==='waves'?0.15:0.4), lg=G(key==='waves'?300:200);
        lfo.connect(lg); lg.connect(f.frequency); lfo.start(t); lfo.stop(t+dur); srcs.push(lfo);
        startF(n,f,g,0,dur); break; }
      case 'bird': {
        dur=2.5;
        for(let i=0;i<5;i++){ const o=O('sine',2000), g=G(0), st=t+i*0.45;
          o.frequency.setValueAtTime(2200+Math.random()*800, st);
          o.frequency.exponentialRampToValueAtTime(3200+Math.random()*800, st+0.12);
          o.frequency.exponentialRampToValueAtTime(2400, st+0.25);
          g.gain.setValueAtTime(0.25,st); g.gain.exponentialRampToValueAtTime(0.001,st+0.3);
          o.connect(g); g.connect(dest); o.start(st); o.stop(st+0.35); srcs.push(o); }
        break; }
      case 'frog': {
        dur=1.8;
        for(let i=0;i<6;i++){ const o=O('square',90+Math.random()*40), g=G(0), f=F('lowpass',500), st=t+i*0.28;
          g.gain.setValueAtTime(0.2,st); g.gain.exponentialRampToValueAtTime(0.001,st+0.2);
          o.connect(f); f.connect(g); g.connect(dest); o.start(st); o.stop(st+0.25); srcs.push(o); }
        break; }
      case 'rooster': {
        dur=1.5; const o=O('sawtooth',600), g=G(0);
        o.frequency.setValueAtTime(500,t); o.frequency.linearRampToValueAtTime(900,t+0.5);
        o.frequency.linearRampToValueAtTime(700,t+1.0); o.frequency.linearRampToValueAtTime(1000,t+1.4);
        g.gain.setValueAtTime(0.2,t); g.gain.exponentialRampToValueAtTime(0.001,t+dur);
        startF(o,F('bandpass',1200,2),g,0,dur); break; }
      case 'dog': {
        dur=1.2;
        for(let i=0;i<3;i++){ const o=O('sawtooth',180), g=G(0), f=F('lowpass',900), st=t+i*0.35;
          o.frequency.setValueAtTime(220,st); o.frequency.exponentialRampToValueAtTime(120,st+0.18);
          g.gain.setValueAtTime(0.4,st); g.gain.exponentialRampToValueAtTime(0.001,st+0.25);
          o.connect(f); f.connect(g); g.connect(dest); o.start(st); o.stop(st+0.3); srcs.push(o); }
        break; }
      case 'cricket': case 'nightquiet': {
        dur=key==='cricket'?4:6;
        for(let i=0;i<(key==='cricket'?24:8);i++){ const o=O('sine',4200), g=G(0), st=t+i*(dur/(key==='cricket'?24:8));
          g.gain.setValueAtTime(key==='cricket'?0.05:0.02,st); g.gain.exponentialRampToValueAtTime(0.001,st+0.09);
          o.connect(g); g.connect(dest); o.start(st); o.stop(st+0.1); srcs.push(o); }
        break; }
      case 'chicken': { // gà cục tác: short 900→560Hz clucks
        dur=2.0;
        for(let i=0;i<7;i++){ const o=O('square',900), g=G(0), f=F('lowpass',1800), st=t+i*0.27+Math.random()*0.04;
          o.frequency.setValueAtTime(900,st); o.frequency.exponentialRampToValueAtTime(560,st+0.1);
          g.gain.setValueAtTime(0.22,st); g.gain.exponentialRampToValueAtTime(0.001,st+0.13);
          o.connect(f); f.connect(g); g.connect(dest); o.start(st); o.stop(st+0.15); srcs.push(o); }
        break; }
      case 'cicada': { // ve sầu: 5.2kHz + 4.8kHz carriers, fast AM
        dur=5;
        const mk=(fq,base,amf)=>{ const o=O('sine',fq), g=G(base);
          const lfo=O('sine',amf), lg=G(base); lfo.connect(lg); lg.connect(g.gain);
          o.connect(g); g.connect(dest);
          o.start(t); o.stop(t+dur); lfo.start(t); lfo.stop(t+dur); srcs.push(o,lfo); };
        mk(5200,0.035,45); mk(4800,0.015,38);
        break; }
      case 'buffalo': { // trâu rống: deep ~95→85Hz bellow with waver
        dur=2.5; const o=O('sawtooth',95), f=F('lowpass',400), g=G(0);
        o.frequency.setValueAtTime(95,t); o.frequency.linearRampToValueAtTime(85,t+dur);
        const vib=O('sine',2.5), vg=G(6); vib.connect(vg); vg.connect(o.frequency);
        const wob=O('sine',3), wg=G(0.1); wob.connect(wg); wg.connect(g.gain);
        g.gain.setValueAtTime(0.001,t); g.gain.linearRampToValueAtTime(0.3,t+0.25);
        g.gain.setValueAtTime(0.3,t+dur-0.4); g.gain.linearRampToValueAtTime(0.001,t+dur);
        o.connect(f); f.connect(g); g.connect(dest);
        o.start(t); o.stop(t+dur); vib.start(t); vib.stop(t+dur); wob.start(t); wob.stop(t+dur);
        srcs.push(o,vib,wob); break; }
      case 'horse': { // ngựa hí: 500→1500Hz whinny with vibrato
        dur=1.8; const o=O('sawtooth',500), f=F('bandpass',1000,1.2), g=G(0);
        o.frequency.setValueAtTime(500,t); o.frequency.linearRampToValueAtTime(1500,t+dur);
        const vib=O('sine',7), vg=G(80); vib.connect(vg); vg.connect(o.frequency);
        g.gain.setValueAtTime(0.001,t); g.gain.linearRampToValueAtTime(0.25,t+0.15);
        g.gain.setValueAtTime(0.25,t+dur-0.3); g.gain.exponentialRampToValueAtTime(0.001,t+dur);
        o.connect(f); f.connect(g); g.connect(dest);
        o.start(t); o.stop(t+dur); vib.start(t); vib.stop(t+dur); srcs.push(o,vib); break; }
      case 'crow': { // quạ kêu: 4 harsh descending caws ~340→240Hz
        dur=1.5;
        for(let i=0;i<4;i++){ const o=O('sawtooth',340), g=G(0), f=F('bandpass',900,2), st=t+i*0.36;
          o.frequency.setValueAtTime(340,st); o.frequency.exponentialRampToValueAtTime(240,st+0.22);
          g.gain.setValueAtTime(0.3,st); g.gain.exponentialRampToValueAtTime(0.001,st+0.3);
          o.connect(f); f.connect(g); g.connect(dest); o.start(st); o.stop(st+0.32); srcs.push(o);
          const n=N(0.25), nf=F('bandpass',900,2), ng=G(0);
          ng.gain.setValueAtTime(0.07,st); ng.gain.exponentialRampToValueAtTime(0.001,st+0.25);
          startF(n,nf,ng,i*0.36,0.25); }
        break; }
      case 'motorbike': {
        dur=3; const o=O('sawtooth',70), g=G(0.25), f=F('lowpass',600);
        o.frequency.linearRampToValueAtTime(130,t+dur);
        startF(o,f,g,0,dur);
        const n=N(dur), ng=G(0.08); startF(n,F('highpass',2000),ng,0,dur); break; }
      case 'bicycle': {
        dur=2;
        for(let i=0;i<8;i++){ const o=O('sine',300), g=G(0), st=t+i*0.25;
          g.gain.setValueAtTime(0.1,st); g.gain.exponentialRampToValueAtTime(0.001,st+0.15);
          o.connect(g); g.connect(dest); o.start(st); o.stop(st+0.2); srcs.push(o); }
        break; }
      case 'horn': {
        dur=0.8; const o=O('square',350), o2=O('square',440), g=G(0.15);
        o.connect(g); o2.connect(g); g.connect(dest);
        o.start(t); o2.start(t); o.stop(t+dur); o2.stop(t+dur); srcs.push(o,o2); break; }
      case 'boat': {
        dur=3.5;
        for(let i=0;i<7;i++){ const n=N(0.4), f=F('bandpass',600,1.5), g=G(0), st=t+i*0.5;
          g.gain.setValueAtTime(0.3,st); g.gain.exponentialRampToValueAtTime(0.001,st+0.4);
          startF(n,f,g,i*0.5,0.45); }
        break; }
      case 'footstep': {
        dur=1.0;
        for(let i=0;i<4;i++){ const o=O('sine',90), g=G(0), st=t+i*0.25;
          o.frequency.exponentialRampToValueAtTime(45,st+0.12);
          g.gain.setValueAtTime(0.5,st); g.gain.exponentialRampToValueAtTime(0.001,st+0.15);
          o.connect(g); g.connect(dest); o.start(st); o.stop(st+0.2); srcs.push(o); }
        break; }
      case 'broom': {
        dur=1.5;
        for(let i=0;i<6;i++){ const n=N(0.25), f=F('bandpass',2500,1), g=G(0), st=t+i*0.25;
          g.gain.setValueAtTime(0.25,st); g.gain.exponentialRampToValueAtTime(0.001,st+0.22);
          startF(n,f,g,i*0.25,0.25); }
        break; }
      case 'splash': {
        dur=1.5; const n=N(dur), f=F('bandpass',1200,0.8), g=G(0.4);
        g.gain.setValueAtTime(0.4,t); g.gain.exponentialRampToValueAtTime(0.001,t+dur);
        startF(n,f,g,0,dur); break; }
      case 'punch': case 'thud': {
        dur=key==='punch'?0.6:0.9; const o=O('sine',key==='punch'?150:100), g=G(0.7);
        o.frequency.exponentialRampToValueAtTime(40,t+0.25);
        g.gain.setValueAtTime(0.7,t); g.gain.exponentialRampToValueAtTime(0.001,t+dur);
        o.connect(g); g.connect(dest); o.start(t); o.stop(t+dur); srcs.push(o);
        const n=N(0.15), ng=G(0.3); startF(n,F('highpass',1500),ng,0,0.15); break; }
      case 'clap': case 'applause': {
        const nBurst=(st)=>{ const n=N(0.08), f=F('bandpass',2000,1.2), g=G(key==='clap'?0.4:0.15);
          startF(n,f,g,st,0.1); };
        if(key==='clap'){ dur=1.2; for(let i=0;i<5;i++) nBurst(i*0.22); }
        else { dur=3; for(let i=0;i<60;i++) nBurst(Math.random()*dur); }
        break; }
      case 'cry': {
        dur=2.5;
        for(let i=0;i<3;i++){ const o=O('sine',600), g=G(0), st=t+i*0.8;
          o.frequency.setValueAtTime(700,st); o.frequency.linearRampToValueAtTime(450,st+0.6);
          g.gain.setValueAtTime(0.18,st); g.gain.exponentialRampToValueAtTime(0.001,st+0.7);
          o.connect(g); g.connect(dest); o.start(st); o.stop(st+0.75); srcs.push(o); }
        break; }
      case 'laugh': {
        dur=2.0;
        for(let i=0;i<8;i++){ const o=O('sawtooth',300+Math.random()*150), g=G(0), f=F('bandpass',1000,1.5), st=t+i*0.22;
          g.gain.setValueAtTime(0.2,st); g.gain.exponentialRampToValueAtTime(0.001,st+0.15);
          o.connect(f); f.connect(g); g.connect(dest); o.start(st); o.stop(st+0.18); srcs.push(o); }
        break; }
      case 'gallop': { // vó ngựa: 3-beat thump cycle, 0.5s
        dur=2.0;
        const thump=(off)=>{ const o=O('sine',75), g=G(0), st=t+off;
          o.frequency.setValueAtTime(75,st); o.frequency.exponentialRampToValueAtTime(40,st+0.1);
          g.gain.setValueAtTime(0.55,st); g.gain.exponentialRampToValueAtTime(0.001,st+0.14);
          o.connect(g); g.connect(dest); o.start(st); o.stop(st+0.16); srcs.push(o);
          const n=N(0.05), nf=F('lowpass',800), ng=G(0.12);
          startF(n,nf,ng,off,0.05); };
        for(let cyc=0;cyc<4;cyc++){ const b=cyc*0.5; thump(b); thump(b+0.13); thump(b+0.26); }
        break; }
      case 'firecracker': { // pháo nổ: random sharp pops + deep booms
        dur=3.0;
        for(let i=0;i<55;i++){ const off=Math.random()*dur, st=t+off;
          const n=N(0.04), f=F('highpass',800), g=G(0);
          g.gain.setValueAtTime(0.3+Math.random()*0.3,st); g.gain.exponentialRampToValueAtTime(0.001,st+0.04);
          startF(n,f,g,off,0.05); }
        for(let i=0;i<6;i++){ const st=t+Math.random()*dur, o=O('sine',120), g=G(0);
          o.frequency.setValueAtTime(120,st); o.frequency.exponentialRampToValueAtTime(50,st+0.15);
          g.gain.setValueAtTime(0.4,st); g.gain.exponentialRampToValueAtTime(0.001,st+0.2);
          o.connect(g); g.connect(dest); o.start(st); o.stop(st+0.25); srcs.push(o); }
        break; }
      case 'fire': { // lửa cháy: low rumble bed + random crackle pops
        dur=4; const n=N(dur), f=F('lowpass',900), g=G(0.12); startF(n,f,g,0,dur);
        for(let i=0;i<30;i++){ const off=Math.random()*dur, st=t+off;
          const n2=N(0.06), f2=F('bandpass',2500+Math.random()*1500,2), g2=G(0);
          g2.gain.setValueAtTime(0.12+Math.random()*0.15,st); g2.gain.exponentialRampToValueAtTime(0.001,st+0.06);
          startF(n2,f2,g2,off,0.07); }
        break; }
      case 'pour': { // đổ thóc rào rào: broadband burst + grain pings
        dur=2.5; const n=N(dur), f=F('bandpass',3000,0.7), g=G(0);
        g.gain.setValueAtTime(0.001,t); g.gain.linearRampToValueAtTime(0.35,t+0.2);
        g.gain.setValueAtTime(0.35,t+dur-0.4); g.gain.linearRampToValueAtTime(0.001,t+dur);
        startF(n,f,g,0,dur);
        for(let i=0;i<25;i++){ const o=O('sine',2500+Math.random()*2000), og=G(0), st=t+Math.random()*dur;
          og.gain.setValueAtTime(0.06,st); og.gain.exponentialRampToValueAtTime(0.001,st+0.05);
          o.connect(og); og.connect(dest); o.start(st); o.stop(st+0.06); srcs.push(o); }
        break; }
      case 'chop': { // rìu chặt "chát!": transient + wood resonance
        dur=0.8;
        const n=N(0.06), nf=F('highpass',2000), ng=G(0);
        ng.gain.setValueAtTime(0.6,t); ng.gain.exponentialRampToValueAtTime(0.001,t+0.06);
        startF(n,nf,ng,0,0.06);
        [[180,0.4],[360,0.2],[90,0.25]].forEach(([fq,v])=>{
          const o=O('sine',fq), g=G(0);
          g.gain.setValueAtTime(v,t+0.01); g.gain.exponentialRampToValueAtTime(0.001,t+0.55);
          o.connect(g); g.connect(dest); o.start(t); o.stop(t+0.6); srcs.push(o); });
        break; }
      case 'whisper': { // xì xào: soft bandpassed murmur, 4Hz syllable AM
        dur=3; const n=N(dur), f=F('bandpass',1500,1), g=G(0.05);
        const lfo=O('sine',4), lg=G(0.03); lfo.connect(lg); lg.connect(g.gain);
        lfo.start(t); lfo.stop(t+dur); srcs.push(lfo);
        startF(n,f,g,0,dur); break; }
      case 'announce': { // loa phóng thanh: 660→880Hz PA chime, bandpass + soft clip
        dur=2.0;
        const tone=(fq,off,d)=>{ const o=O('sine',fq), g=G(0), st=t+off;
          const ws=c.createWaveShaper(); const curve=new Float32Array(256);
          for(let i=0;i<256;i++){ const x=i/128-1; curve[i]=Math.tanh(2.2*x); }
          ws.curve=curve;
          const bp=F('bandpass',1400,0.6);
          g.gain.setValueAtTime(0.001,st); g.gain.linearRampToValueAtTime(0.28,st+0.05);
          g.gain.setValueAtTime(0.28,st+d-0.08); g.gain.linearRampToValueAtTime(0.001,st+d);
          o.connect(ws); ws.connect(bp); bp.connect(g); g.connect(dest);
          o.start(st); o.stop(st+d+0.02); srcs.push(o); };
        tone(660,0.1,0.4); tone(880,0.6,0.5);
        const n=N(0.03), ng=G(0.15); startF(n,F('highpass',3000),ng,0.05,0.03); // PA click
        break; }
      case 'tea': { // rót trà: rising bandpass sweep (filling cup) + droplets
        dur=2.5; const n=N(dur), f=F('bandpass',800,1.5), g=G(0);
        f.frequency.setValueAtTime(800,t); f.frequency.linearRampToValueAtTime(2200,t+dur);
        g.gain.setValueAtTime(0.001,t); g.gain.linearRampToValueAtTime(0.22,t+0.15);
        g.gain.setValueAtTime(0.22,t+dur-0.4); g.gain.linearRampToValueAtTime(0.001,t+dur);
        startF(n,f,g,0,dur);
        const w=O('sine',800), wg=G(0);
        w.frequency.setValueAtTime(800,t); w.frequency.linearRampToValueAtTime(2200,t+dur);
        wg.gain.setValueAtTime(0.001,t); wg.gain.linearRampToValueAtTime(0.06,t+0.3);
        wg.gain.linearRampToValueAtTime(0.001,t+dur);
        w.connect(wg); wg.connect(dest); w.start(t); w.stop(t+dur); srcs.push(w);
        for(let i=0;i<12;i++){ const o=O('sine',1800+Math.random()*1500), og=G(0), st=t+0.3+Math.random()*(dur-0.6);
          og.gain.setValueAtTime(0.05,st); og.gain.exponentialRampToValueAtTime(0.001,st+0.07);
          o.connect(og); og.connect(dest); o.start(st); o.stop(st+0.08); srcs.push(o); }
        break; }
      case 'smoke-puff': { // nhả khói thuốc: soft breathy exhale, lowpass noise
        dur=1.2; const n=N(dur), f=F('lowpass',700), g=G(0);
        g.gain.setValueAtTime(0.001,t); g.gain.linearRampToValueAtTime(0.22,t+0.25);
        g.gain.setValueAtTime(0.22,t+0.5); g.gain.exponentialRampToValueAtTime(0.001,t+dur);
        startF(n,f,g,0,dur);
        const n2=N(0.4), f2=F('highpass',2500), g2=G(0); // faint crackle at start
        g2.gain.setValueAtTime(0.06,t); g2.gain.exponentialRampToValueAtTime(0.001,t+0.4);
        startF(n2,f2,g2,0,0.4);
        break; }
      case 'bell': {
        dur=3;
        [[523,0.25],[784,0.12],[1046,0.08],[1568,0.04]].forEach(([fq,v])=>{
          const o=O('sine',fq), g=G(0);
          g.gain.setValueAtTime(v,t); g.gain.exponentialRampToValueAtTime(0.0005,t+dur);
          o.connect(g); g.connect(dest); o.start(t); o.stop(t+dur); srcs.push(o); });
        break; }
      case 'magic': case 'whoosh': {
        dur=key==='magic'?2:2.5; const o=O('sine',200), g=G(0.15);
        o.frequency.exponentialRampToValueAtTime(key==='magic'?2000:100,t+dur*0.7);
        if(key==='magic') o.frequency.exponentialRampToValueAtTime(3000,t+dur);
        g.gain.setValueAtTime(0.001,t); g.gain.linearRampToValueAtTime(0.15,t+dur*0.4);
        g.gain.exponentialRampToValueAtTime(0.001,t+dur);
        o.connect(g); g.connect(dest); o.start(t); o.stop(t+dur); srcs.push(o); break; }
      case 'crowd': {
        dur=5; const n=N(dur), f=F('bandpass',800,0.5), g=G(0.2);
        startF(n,f,g,0,dur);
        for(let i=0;i<20;i++){ const o=O('sine',150+Math.random()*250), og=G(0), st=t+Math.random()*dur;
          og.gain.setValueAtTime(0.05,st); og.gain.exponentialRampToValueAtTime(0.001,st+0.3);
          o.connect(og); og.connect(dest); o.start(st); o.stop(st+0.35); srcs.push(o); }
        break; }
      case 'drum': {
        dur=4; const kick=(st)=>{ const o=O('sine',120), g=G(0.6);
          o.frequency.exponentialRampToValueAtTime(45,st+0.2);
          g.gain.setValueAtTime(0.6,st); g.gain.exponentialRampToValueAtTime(0.001,st+0.3);
          o.connect(g); g.connect(dest); o.start(st); o.stop(st+0.35); srcs.push(o); };
        for(let i=0;i<8;i++) kick(t+i*0.5);
        break; }
      case 'mus_gentle': { // dịu dàng: Cmaj7 → Am7 warm pads, crossfade
        dur=8;
        const pad=(freqs,off,d)=>{ const st=t+off;
          freqs.forEach(fq=>{ const o=O('triangle',fq), g=G(0);
            g.gain.setValueAtTime(0.001,st); g.gain.linearRampToValueAtTime(0.07,st+0.8);
            g.gain.setValueAtTime(0.07,st+d-0.8); g.gain.linearRampToValueAtTime(0.001,st+d);
            o.connect(g); g.connect(dest); o.start(st); o.stop(st+d); srcs.push(o); }); };
        pad([261.63,329.63,392.0,493.88],0,4.2);
        pad([220.0,261.63,329.63,392.0],3.8,4.2);
        break; }
      case 'mus_spooky': { // ma mị: Am + dissonant Bb, 3Hz tremolo
        dur=8;
        const bus=G(0.65); bus.connect(dest);
        const lfo=O('sine',3), lg=G(0.35); lfo.connect(lg); lg.connect(bus.gain);
        lfo.start(t); lfo.stop(t+dur); srcs.push(lfo);
        [[110,0.05],[220,0.05],[261.63,0.05],[329.63,0.05],[466.16,0.03]].forEach(([fq,v])=>{
          const o=O('sine',fq), g=G(0);
          g.gain.setValueAtTime(0.001,t); g.gain.linearRampToValueAtTime(v,t+1);
          g.gain.setValueAtTime(v,t+dur-1); g.gain.linearRampToValueAtTime(0.001,t+dur);
          o.connect(g); g.connect(bus); o.start(t); o.stop(t+dur); srcs.push(o); });
        break; }
      case 'mus_triumph': { // chiến thắng: C → G, bright saws + bass, 2Hz pulse
        dur=8;
        const bus=G(0.8); bus.connect(dest);
        const pl=O('sine',2), plg=G(0.25); pl.connect(plg); plg.connect(bus.gain);
        pl.start(t); pl.stop(t+dur); srcs.push(pl);
        const chord=(freqs,off,d)=>{ const st=t+off;
          freqs.forEach(fq=>{
            const o=O('sawtooth',fq), f=F('lowpass',1200), g=G(0);
            g.gain.setValueAtTime(0.001,st); g.gain.linearRampToValueAtTime(0.055,st+0.3);
            g.gain.setValueAtTime(0.055,st+d-0.5); g.gain.linearRampToValueAtTime(0.001,st+d);
            o.connect(f); f.connect(g); g.connect(bus); o.start(st); o.stop(st+d); srcs.push(o);
            const b=O('triangle',fq/2), bg=G(0);
            bg.gain.setValueAtTime(0.001,st); bg.gain.linearRampToValueAtTime(0.06,st+0.3);
            bg.gain.setValueAtTime(0.06,st+d-0.5); bg.gain.linearRampToValueAtTime(0.001,st+d);
            b.connect(bg); bg.connect(bus); b.start(st); b.stop(st+d); srcs.push(b); }); };
        chord([261.63,329.63,392.0],0,4.2);
        chord([196.0,246.94,293.66],3.8,4.2);
        break; }
      case 'mus_longing': { // nhớ nhung: Am pad + slow E5→D5→C5 melody, vibrato
        dur=8;
        [220.0,261.63,329.63].forEach(fq=>{ const o=O('triangle',fq), g=G(0);
          g.gain.setValueAtTime(0.001,t); g.gain.linearRampToValueAtTime(0.05,t+1);
          g.gain.setValueAtTime(0.05,t+dur-1); g.gain.linearRampToValueAtTime(0.001,t+dur);
          o.connect(g); g.connect(dest); o.start(t); o.stop(t+dur); srcs.push(o); });
        const note=(fq,off,d)=>{ const o=O('sine',fq), g=G(0), v=O('sine',5.5), vg=G(6), st=t+off;
          v.connect(vg); vg.connect(o.frequency);
          g.gain.setValueAtTime(0.001,st); g.gain.linearRampToValueAtTime(0.12,st+0.4);
          g.gain.setValueAtTime(0.12,st+d-0.5); g.gain.exponentialRampToValueAtTime(0.001,st+d);
          o.connect(g); g.connect(dest);
          o.start(st); o.stop(st+d); v.start(st); v.stop(st+d); srcs.push(o,v); };
        note(659.26,0.5,2.0); note(587.33,2.5,2.0); note(523.25,4.5,2.5);
        break; }
      default: { // nhạc nền: hợp âm đơn giản
        const chords={mus_happy:[[261,329,392]], mus_sad:[[220,261,329]], mus_magic:[[329,415,493]], mus_tense:[[196,207,261]], mus_fest:[[392,494,587]]}[key]||[[261,329,392]];
        dur=4; const ch=chords[0];
        ch.forEach(fq=>{ const o=O('triangle',fq), g=G(0.08);
          g.gain.setValueAtTime(0.001,t); g.gain.linearRampToValueAtTime(0.08,t+0.5);
          g.gain.setValueAtTime(0.08,t+dur-0.5); g.gain.linearRampToValueAtTime(0.001,t+dur);
          o.connect(g); g.connect(dest); o.start(t); o.stop(t+dur); srcs.push(o); });
      }
    }
    return { dur, stop(){ for (const s of srcs){ try{ s.stop(); }catch(e){} } } };
  }

  /** Play one SFX at volume 0..1. Returns {stop, dur}. */
  play(key, volume=0.8){
    const c = this._ctx();
    const master = c.createGain();
    master.gain.value = Math.max(0, Math.min(1, volume));
    master.connect(c.destination);
    const r = this._synth(c, key, master, c.currentTime);
    const handle = { dur: r.dur, stop(){ r.stop(); } };
    this._active.add(handle);
    setTimeout(()=>this._active.delete(handle), (r.dur + 0.5) * 1000);
    return handle;
  }

  /** Toggle preview tied to a button element (updates ▶/⏹). */
  preview(key, btn){
    if (this._previewBtn === btn && this._previewStop){
      this._previewStop(); this._clearPreviewBtn();
      return;
    }
    this._stopPreview();
    const c = this._ctx();
    const master = c.createGain();
    master.gain.value = 0.6;
    master.connect(c.destination);
    const r = this._synth(c, key, master, c.currentTime);
    this._previewBtn = btn;
    this._previewStop = ()=>{ try{ r.stop(); }catch(e){} };
    if (btn){ btn.classList.add('playing'); btn.textContent = '⏹'; }
    setTimeout(()=>{ if (this._previewBtn === btn) this._stopPreview(); }, (r.dur + 0.3) * 1000);
  }

  _clearPreviewBtn(){
    if (this._previewBtn){ this._previewBtn.classList.remove('playing'); this._previewBtn.textContent = '▶'; }
    this._previewBtn = null; this._previewStop = null;
  }
  _stopPreview(){
    if (this._previewStop){ try{ this._previewStop(); }catch(e){} }
    this._clearPreviewBtn();
  }

  /** Play a scene mix: [{key, t0, volume, loop}] — used by audio timeline preview. */
  playMix(clips, sceneDur){
    this.stopAll();
    const c = this._ctx();
    const handles = [];
    for (const cl of clips){
      const master = c.createGain();
      master.gain.value = Math.max(0, Math.min(1, (cl.volume ?? 80) / 100));
      master.connect(c.destination);
      const at = c.currentTime + Math.max(0, cl.t0 || 0);
      if (cl.loop){
        // re-trigger to cover scene duration
        const info = SFX_DUR[cl.key] || 2;
        const n = Math.ceil((sceneDur - (cl.t0 || 0)) / info);
        for (let i = 0; i < n; i++){
          const m2 = c.createGain(); m2.gain.value = master.gain.value; m2.connect(c.destination);
          handles.push(this._synth(c, cl.key, m2, at + i * info));
        }
      } else {
        handles.push({ stop: this._synth(c, cl.key, master, at).stop });
      }
    }
    const h = { stop(){ for (const x of handles){ try{ x.stop(); }catch(e){} } } };
    this._active.add(h);
    setTimeout(()=>this._active.delete(h), (sceneDur + 1) * 1000);
    return h;
  }

  stopAll(){
    this._stopPreview();
    for (const h of [...this._active]){ try{ h.stop(); }catch(e){} }
    this._active.clear();
  }
}

// expose globally for app.js
window.SFXEngine = SFXEngine;
window.SFX_CATALOG = SFX_CATALOG;
window.SFX_DUR = SFX_DUR;
