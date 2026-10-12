(() => {
'use strict';
/* ============================================================
   DOODLE STUDIO — Visual story builder for doodle-anim
   Data model (museflow-style JSON):
   { title, size:"1920x1080", scenes:[
       {id, background, duration, music, dialogue,
        characters:[{id, char, x, y, scale, flip, anim}]} ] }
   ============================================================ */

// ---------- Asset catalog ----------
const HUMANS = {
  an:    {name:'An (bạn)',      file:'assets/an.png'},
  binh:  {name:'Bình (bạn)',    file:'assets/binh.png'},
  chi:   {name:'Chi (bạn)',     file:'assets/chi.png'},
  dung:  {name:'Dũng (bạn)',    file:'assets/dung.png'},
  ban:   {name:'Bạn (nữ chính)',file:'assets/ban.png'},
  chong: {name:'Chồng',         file:'assets/chong.png'},
  phuong:{name:'Phượng (bạn)',  file:'assets/phuong.png'},
  tu:    {name:'Tú',            file:'assets/tu.png'},
  banoi: {name:'Bà nội',        file:'assets/banoi.png'},
  concai:{name:'3 đứa trẻ',     file:'assets/concai.png'},
};
const ANIMALS = {
  cat:    {name:'Mèo',  emoji:'🐱'},
  dog:    {name:'Chó',  emoji:'🐕'},
  bird:   {name:'Chim', emoji:'🐦'},
  rabbit: {name:'Thỏ',  emoji:'🐰'},
  chicken:{name:'Gà',   emoji:'🐔'},
};
const BACKGROUNDS = {
  'bg-park':     {name:'Công viên',        file:'assets/bg-park.png'},
  'bg-mountain': {name:'Chân núi',         file:'assets/bg-mountain.png'},
  'bg-peak':     {name:'Đỉnh núi',         file:'assets/bg-peak.png'},
  'bg-home':     {name:'Trong nhà',        file:'assets/bg-home.png'},
  'bg-night':    {name:'Đêm',              file:'assets/bg-night.png'},
  'bg-village':  {name:'Bản làng',         file:'assets/bg-village.png'},
  'bg-woodhouse':{name:'Nhà gỗ',           file:'assets/bg-woodhouse.png'},
  'bg-factory':  {name:'Nhà máy',          file:'assets/bg-factory.png'},
  'bg-dorm':     {name:'Phòng trọ',        file:'assets/bg-dorm.png'},
  'bg-road':     {name:'Đường xuống núi',  file:'assets/bg-road.png'},
};
const ANIMS = {idle:'Đứng yên', walk:'Đi bộ', jump:'Nhảy', celebrate:'Ăn mừng'};

// ---------- Weather / FX catalog ----------
const WEATHER_IDS = ['rain','snow','fog','dust','leaves'];
const WEATHER_DEFS = [
  {id:'rain',   name:'🌧️ Mưa',     desc:'Hạt mưa xiên theo gió'},
  {id:'snow',   name:'❄️ Tuyết',    desc:'Bông tuyết rơi lả tả'},
  {id:'fog',    name:'🌫️ Sương mù', desc:'Lớp mờ trôi ngang'},
  {id:'dust',   name:'✨ Đom đóm',   desc:'Bụi bay / phát sáng ban đêm'},
  {id:'leaves', name:'🍂 Lá rơi',    desc:'Lá xoay rơi theo gió'},
];
const EMOJIS = ['😢','😭','💧','✨','💫','❤️','💔','😡','💢','😱','😂','🤣',
  '👏','🙏','💡','❓','❗','💤','🌧️','⛈️','🔥','💥','🎉','👻','😴','🤔','👀','💪'];
const BUBBLE_STYLES = [
  {id:'speech', name:'💬 Thoại',    desc:'Bong bóng nói'},
  {id:'thought',name:'💭 Suy nghĩ', desc:'Bong bóng nghĩ (nét đứt)'},
  {id:'shout',  name:'📢 Hét to',    desc:'Nền vàng, viền đỏ'},
];

// ---------- State ----------
let uid = 0;
const nid = (p) => p + '_' + (++uid) + '_' + Date.now().toString(36);

const state = {
  project: {
    title: 'Câu chuyện của tôi',
    size: '1920x1080',
    scenes: [],
  },
  activeScene: 0,
  selectedChar: null,   // instance id
  selectedOverlay: null, // overlay id
  dragOverlay: null,
  playing: false,
  playSceneIdx: 0,
  playT0: 0,
  playElapsed: null,    // seconds into current playing scene (for waypoint playback)
  dragChar: null,
  dragOffset: {x:0, y:0},
  libTab: 'humans',
  wpMode: false,        // waypoint-add mode: plain clicks add waypoints
  wpHit: [],            // waypoint marker hit-test list (project coords)
};

const $ = (s) => document.querySelector(s);
const canvas = $('#stage');
const ctx = canvas.getContext('2d');
const imgCache = {};

// SFX engine (Web Audio synth) — loaded from js/sfx-engine.js
const sfxEngine = (typeof SFXEngine !== 'undefined') ? new SFXEngine() : null;

// Weather/FX engine — loaded from js/weather-engine.js (deterministic particles)
const fxCanvas = $('#fxCanvas');
const fxEngine = (typeof WeatherEngine !== 'undefined' && fxCanvas) ? new WeatherEngine(fxCanvas) : null;

function loadImg(src){
  if (imgCache[src]) return imgCache[src];
  const im = new Image();
  im.src = src;
  imgCache[src] = im;
  return im;
}
// NOTE: character PNGs in assets/ are pre-keyed (transparent background)
// via PIL at build time, so no runtime chroma-key is needed
// (canvas getImageData is blocked on file:// anyway).
function projSize(){
  const [w,h] = state.project.size.split('x').map(Number);
  return {w, h};
}

// ---------- Project helpers ----------
function newScene(over={}){
  return Object.assign({
    id: nid('s'),
    background: 'bg-park',
    duration: 10,
    music: 'none',
    dialogue: '',
    characters: [],
    sfx: [],   // [{id, key, name, t0, volume(0-100), loop}]
    weather: {rain:0, snow:0, fog:0, dust:0, leaves:0},  // 0-100 per effect
    overlays: [], // [{id, type:'emoji'|'bubble', value/text, x, y, size, t0, t1}]
  }, over);
}
function newSfxClip(key){
  const info = (typeof SFXEngine !== 'undefined') ? SFXEngine.info(key) : null;
  return { id: nid('x'), key, name: info?.n || key,
           dur: (typeof SFX_DUR !== 'undefined' ? SFX_DUR[key] : null) || 2,
           t0: 0, volume: 80, loop: !!(info?.loop) };
}
function newOverlay(type, value, x, y){
  const sc = activeSceneObj();
  return {
    id: nid('o'),
    type: type === 'bubble' ? 'bubble' : 'emoji',
    value: type === 'emoji' ? (value || '✨') : (value || 'speech'),
    text: '...',
    x: Math.round(x), y: Math.round(y),
    size: 64,
    t0: 0, t1: sc ? sc.duration : 10,
  };
}
function getSelOverlay(){
  return activeSceneObj()?.overlays.find(o=>o.id===state.selectedOverlay) || null;
}
function newCharInstance(charKey, x, y){
  return { id: nid('c'), char: charKey, x, y, scale: 1.0, flip: false, anim: 'idle', waypoints: [] };
}
function activeSceneObj(){ return state.project.scenes[state.activeScene]; }
function newProject(){
  state.project = { title:'Câu chuyện của tôi', size:'1920x1080', scenes:[ newScene() ] };
  state.activeScene = 0; state.selectedChar = null;
  $('#projectTitle').value = state.project.title;
  $('#projectSize').value = state.project.size;
  syncAll();
}
function toast(msg, ms=2200){
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(()=>t.classList.remove('show'), ms);
}

// ---------- Library ----------
function renderLibrary(){
  const grid = $('#libGrid'); grid.innerHTML = '';
  const hint = $('#libHint');
  if (hint) hint.textContent = state.libTab === 'sfx'
    ? '▶ bấm để nghe thử • double-click để thêm vào scene'
    : state.libTab === 'fx'
    ? '🌦️ bật/tắt hiệu ứng thời tiết • 😀 click emoji để thêm vào canvas'
    : 'Kéo thả vào canvas để thêm';
  if (state.libTab === 'sfx'){ renderSfxLibrary(grid); }
  else if (state.libTab === 'fx'){ renderFxTab(grid); }
  else {
  const mk = (key, label, innerHTML, extra='') => {
    const d = document.createElement('div');
    d.className = 'lib-item ' + extra;
    d.draggable = true;
    d.innerHTML = innerHTML + `<div class="name">${label}</div>`;
    d.addEventListener('dragstart', (e)=>{
      e.dataTransfer.setData('text/plain', JSON.stringify({kind: state.libTab, key}));
      e.dataTransfer.effectAllowed = 'copy';
    });
    // click = quick add to center
    d.addEventListener('click', ()=>{
      if (state.libTab === 'bgs'){
        activeSceneObj().background = key; syncProps(); draw(); renderTimeline(); toast('Đã đổi bối cảnh: ' + label);
      } else {
        addCharToScene(key, state.libTab);
      }
    });
    grid.appendChild(d);
  };
  if (state.libTab === 'humans'){
    for (const [k,v] of Object.entries(HUMANS)) mk(k, v.name, `<img src="${v.file}" alt="${v.name}">`);
  } else if (state.libTab === 'animals'){
    for (const [k,v] of Object.entries(ANIMALS)) mk(k, v.name, `<div class="emoji">${v.emoji}</div>`);
  } else {
    for (const [k,v] of Object.entries(BACKGROUNDS)) mk(k, v.name, `<img src="${v.file}" alt="${v.name}">`, 'bg');
  }
  }
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===state.libTab));
}

// ---------- FX tab: weather + emoji/meme overlays ----------
function renderFxTab(grid){
  const sc = activeSceneObj();
  grid.style.display = 'block';
  if (!sc){ grid.innerHTML = '<div class="ovl-empty">Chưa có scene.</div>'; return; }
  if (!Array.isArray(sc.overlays)) sc.overlays = [];
  if (!sc.weather) sc.weather = {rain:0, snow:0, fog:0, dust:0, leaves:0};

  // --- weather section ---
  const wxSec = document.createElement('div');
  wxSec.className = 'fx-sec';
  wxSec.innerHTML = '<h4>🌦️ Thời tiết</h4><div class="fx-desc">Áp dụng cho scene hiện tại, xem trực tiếp trên canvas.</div>';
  WEATHER_DEFS.forEach(def=>{
    const val = Math.max(0, Math.min(100, Math.round(sc.weather[def.id] || 0)));
    const row = document.createElement('div');
    row.className = 'wx-row' + (val > 0 ? ' on' : '');
    row.innerHTML = `
      <div class="wx-top">
        <div class="wx-name">${def.name}<small>${def.desc}</small></div>
        <label class="switch" title="Bật/tắt">
          <input type="checkbox" ${val > 0 ? 'checked' : ''}>
          <span class="sl"></span>
        </label>
      </div>
      <div class="wx-slider">Cường độ
        <input type="range" min="0" max="100" value="${val}">
        <span class="wx-val">${val}%</span>
      </div>`;
    const chk = row.querySelector('input[type=checkbox]');
    const rng = row.querySelector('input[type=range]');
    const valEl = row.querySelector('.wx-val');
    const apply = ()=>{
      const v = chk.checked ? Math.max(5, +rng.value) : 0;
      if (chk.checked && +rng.value === 0){ rng.value = 40; }
      sc.weather[def.id] = chk.checked ? +rng.value : 0;
      valEl.textContent = sc.weather[def.id] + '%';
      row.classList.toggle('on', sc.weather[def.id] > 0);
      syncFxEngine(); renderTimeline();
    };
    chk.addEventListener('change', apply);
    rng.addEventListener('input', ()=>{
      if (+rng.value > 0 && !chk.checked) chk.checked = true;
      sc.weather[def.id] = chk.checked ? +rng.value : 0;
      valEl.textContent = sc.weather[def.id] + '%';
      row.classList.toggle('on', sc.weather[def.id] > 0);
      syncFxEngine();
    });
    rng.addEventListener('change', renderTimeline);
    wxSec.appendChild(row);
  });
  grid.appendChild(wxSec);

  // --- emoji picker ---
  const emSec = document.createElement('div');
  emSec.className = 'fx-sec';
  emSec.innerHTML = '<h4>😀 Emoji / Meme</h4><div class="fx-desc">Click để thêm vào giữa canvas, sau đó kéo để di chuyển.</div>';
  const egrid = document.createElement('div');
  egrid.className = 'emoji-grid';
  EMOJIS.forEach(e=>{
    const b = document.createElement('button');
    b.className = 'emoji-btn'; b.textContent = e; b.title = 'Thêm ' + e;
    b.addEventListener('click', ()=>{
      const {w,h} = projSize();
      const ov = newOverlay('emoji', e, w/2 + (Math.random()*120-60), h*0.45);
      sc.overlays.push(ov);
      state.selectedOverlay = ov.id;
      renderFxTab(grid); renderTimeline();
      toast('Đã thêm ' + e + ' — kéo để di chuyển');
    });
    egrid.appendChild(b);
  });
  emSec.appendChild(egrid);
  grid.appendChild(emSec);

  // --- bubble picker ---
  const bSec = document.createElement('div');
  bSec.className = 'fx-sec';
  bSec.innerHTML = '<h4>💭 Bong bóng thoại</h4>';
  BUBBLE_STYLES.forEach(st=>{
    const b = document.createElement('button');
    b.className = 'bubble-btn';
    b.innerHTML = `${st.name}<br><small>${st.desc} — click để thêm</small>`;
    b.addEventListener('click', ()=>{
      const {w,h} = projSize();
      const ov = newOverlay('bubble', st.id, w/2, h*0.32);
      ov.text = st.id === 'thought' ? 'Đang nghĩ...' : st.id === 'shout' ? 'Này!' : 'Xin chào!';
      sc.overlays.push(ov);
      state.selectedOverlay = ov.id;
      renderFxTab(grid); renderTimeline();
      toast('Đã thêm bong bóng — sửa chữ trong danh sách bên dưới');
    });
    bSec.appendChild(b);
  });
  grid.appendChild(bSec);

  // --- overlay list ---
  const oSec = document.createElement('div');
  oSec.className = 'fx-sec';
  oSec.innerHTML = `<h4>📋 Overlays trong scene (${sc.overlays.length})</h4>`;
  if (!sc.overlays.length){
    oSec.innerHTML += '<div class="ovl-empty">Chưa có — click emoji ở trên để thêm.</div>';
  }
  sc.overlays.forEach(ov=>{
    const row = document.createElement('div');
    row.className = 'ovl-row' + (ov.id === state.selectedOverlay ? ' sel' : '');
    const ico = ov.type === 'emoji' ? ov.value : '💬';
    const label = ov.type === 'emoji' ? ('Emoji ' + ov.value) : ('Bong bóng: ' + (ov.text || ''));
    row.innerHTML = `
      <div class="ovl-head" title="Click để chọn">
        <span><span class="ovl-ico">${ico}</span> ${escHtml(label)}</span>
        <button class="ovl-del" title="Xóa">✕</button>
      </div>
      <div class="ovl-ctl">
        <label>Hiện từ (s)<input type="number" data-k="t0" value="${ov.t0}" min="0" step="0.5"></label>
        <label>Đến (s)<input type="number" data-k="t1" value="${ov.t1}" min="0" step="0.5"></label>
        <label>Cỡ<input type="number" data-k="size" value="${ov.size}" min="16" max="400" step="4"></label>
      </div>
      ${ov.type === 'bubble' ? `<div class="ovl-ctl" style="grid-template-columns:1fr"><label>Chữ<input type="text" data-k="text" value="${escHtml(ov.text || '')}"></label></div>` : ''}`;
    row.querySelector('.ovl-head').addEventListener('click', (e)=>{
      if (e.target.classList.contains('ovl-del')) return;
      state.selectedOverlay = ov.id;
      renderFxTab(grid);
    });
    row.querySelector('.ovl-del').addEventListener('click', ()=>{
      sc.overlays = sc.overlays.filter(x=>x.id !== ov.id);
      if (state.selectedOverlay === ov.id) state.selectedOverlay = null;
      renderFxTab(grid); renderTimeline();
      toast('Đã xóa overlay');
    });
    row.querySelectorAll('[data-k]').forEach(inp=>{
      inp.addEventListener('change', ()=>{
        const k = inp.dataset.k;
        if (k === 'text') ov.text = inp.value;
        else if (k === 'size') ov.size = Math.max(16, Math.min(400, +inp.value || 64));
        else if (k === 't0') ov.t0 = Math.max(0, +inp.value || 0);
        else if (k === 't1') ov.t1 = Math.max(0, +inp.value || sc.duration);
        renderTimeline();
      });
      inp.addEventListener('click', (e)=>e.stopPropagation());
    });
    oSec.appendChild(row);
  });
  grid.appendChild(oSec);
  grid.style.display = '';
}

// ---------- SFX library tab ----------
let sfxCatFilter = 'nature';
function renderSfxLibrary(grid){
  if (!sfxEngine || typeof SFX_CATALOG === 'undefined'){
    grid.innerHTML = '<div class="lib-empty">SFX engine chưa tải được.</div>';
    return;
  }
  const cats = SFX_CATALOG;
  // category chips
  const chipRow = document.createElement('div');
  chipRow.className = 'sfx-cats';
  cats.forEach(c=>{
    const b = document.createElement('button');
    b.className = 'sfx-cat' + (c.id === sfxCatFilter ? ' active' : '');
    b.textContent = c.name;
    b.addEventListener('click', ()=>{ sfxCatFilter = c.id; renderLibrary(); });
    chipRow.appendChild(b);
  });
  grid.appendChild(chipRow);
  const cat = cats.find(c=>c.id===sfxCatFilter) || cats[0];
  const list = document.createElement('div');
  list.className = 'sfx-list';
  cat.items.forEach(it=>{
    const d = document.createElement('div');
    d.className = 'sfx-item';
    d.innerHTML = `
      <button class="sfx-play" title="Nghe thử">▶</button>
      <div class="sfx-info"><div class="sfx-name">${it.n}</div><div class="sfx-meta">${it.d}</div></div>`;
    d.querySelector('.sfx-play').addEventListener('click', (e)=>{
      e.stopPropagation();
      sfxEngine.preview(it.k, e.currentTarget);
    });
    // double-click = add to current scene
    d.addEventListener('dblclick', ()=>addSfxToScene(it.k));
    list.appendChild(d);
  });
  grid.appendChild(list);
}

function addSfxToScene(key){
  const sc = activeSceneObj(); if(!sc) return;
  if (!Array.isArray(sc.sfx)) sc.sfx = [];
  const clip = newSfxClip(key);
  sc.sfx.push(clip);
  renderAudioTimeline(); renderTimeline();
  toast('Đã thêm SFX: ' + clip.name + ' 🔊');
}

function addCharToScene(charKey, kind){
  const sc = activeSceneObj(); if(!sc) return;
  const {w,h} = projSize();
  const inst = newCharInstance(kind==='animals' ? 'animal:'+charKey : charKey, Math.round(w/2), Math.round(h*0.82));
  sc.characters.push(inst);
  state.selectedChar = inst.id;
  syncProps(); draw(); renderTimeline();
  const label = kind==='animals' ? ANIMALS[charKey].name : HUMANS[charKey].name;
  toast('Đã thêm: ' + label);
}
function charDef(inst){
  if (inst.char.startsWith('animal:')){
    const k = inst.char.slice(7);
    return {kind:'animal', key:k, name:ANIMALS[k]?.name||k, emoji:ANIMALS[k]?.emoji||'❓'};
  }
  const h = HUMANS[inst.char];
  return {kind:'human', key:inst.char, name:h?.name||inst.char, file:h?.file};
}

// ---------- Canvas sizing ----------
function fitCanvas(){
  const {w,h} = projSize();
  const wrap = $('#stageScroll');
  const pad = 32;
  const availW = wrap.clientWidth - pad, availH = wrap.clientHeight - pad;
  const s = Math.min(availW/w, availH/h, 1.4);
  canvas.width = w; canvas.height = h;
  canvas.style.width = Math.round(w*s)+'px';
  canvas.style.height = Math.round(h*s)+'px';
  canvas._scale = s;
  // FX overlay canvas shares the exact geometry of #stage
  if (fxCanvas){
    fxCanvas.width = w; fxCanvas.height = h;
    fxCanvas.style.width = canvas.style.width;
    fxCanvas.style.height = canvas.style.height;
  }
}
function toProj(e){
  const r = canvas.getBoundingClientRect();
  const {w,h} = projSize();
  return { x:(e.clientX-r.left)/r.width*w, y:(e.clientY-r.top)/r.height*h };
}

// ---------- Sprite metrics ----------
function spriteBox(inst){
  const {w} = projSize();
  if (inst.char.startsWith('animal:')){
    const size = 150*inst.scale;
    return {x:inst.x-size/2, y:inst.y-size, w:size, h:size};
  }
  // human PNG 600x900 → display height = 0.42 * canvasH * scale
  const dispH = projSize().h*0.42*inst.scale;
  const dispW = dispH*(600/900);
  return {x:inst.x-dispW/2, y:inst.y-dispH, w:dispW, h:dispH};
}
function hitChar(inst, px, py){
  const b = spriteBox(inst);
  return px>=b.x && px<=b.x+b.w && py>=b.y && py<=b.y+b.h;
}

// ---------- Waypoints ----------
// waypoints: [{x, t}] — "be at x (project px) at scene-time t (seconds)".
// Position at t=0 is the character's base x. Smoothstep ease in-out between keys.
function sortWps(inst){
  if (Array.isArray(inst.waypoints)) inst.waypoints.sort((a,b)=>a.t-b.t);
  else inst.waypoints = [];
}
function waypointPos(inst, el){
  const wps = (inst.waypoints||[]).slice().sort((a,b)=>a.t-b.t);
  if (!wps.length || el==null) return {x: inst.x, moving:false, dx:0};
  const kfs = [{x: inst.x, t: 0}, ...wps];
  if (el <= kfs[0].t) return {x: kfs[0].x, moving:false, dx:0};
  for (let i=0;i<kfs.length-1;i++){
    const a=kfs[i], b=kfs[i+1];
    if (el>=a.t && el<=b.t){
      if (b.t<=a.t) return {x:b.x, moving:false, dx:0};
      let p=(el-a.t)/(b.t-a.t);
      p=p*p*(3-2*p); // smoothstep ease in-out
      return {x:a.x+(b.x-a.x)*p, moving:true, dx:b.x-a.x};
    }
  }
  return {x:kfs[kfs.length-1].x, moving:false, dx:0};
}
function addWaypoint(inst, x){
  const sc = activeSceneObj(); if(!sc) return;
  const {w} = projSize();
  x = Math.round(Math.min(w, Math.max(0, x)));
  sortWps(inst);
  const wps = inst.waypoints;
  const lastT = wps.length ? wps[wps.length-1].t : 0;
  if (lastT >= sc.duration){ toast('Scene đã hết thời gian — tăng duration hoặc sửa waypoint'); return; }
  const t = Math.min(sc.duration, +(lastT + 2).toFixed(1));
  wps.push({x, t});
  sortWps(inst);
  syncWaypointList(); draw(); renderTimeline();
  toast(`📍 Waypoint ${wps.length}: x=${x} @ ${t}s`);
}
function wpHitAt(px, py){
  const R = 22; // project-px hit radius
  return (state.wpHit||[]).find(m => Math.hypot(m.x-px, m.y-py) <= R) || null;
}
function drawWaypointPath(inst){
  const pts = [{x: inst.x, t: 0}, ...(inst.waypoints||[]).slice().sort((a,b)=>a.t-b.t)];
  const y = inst.y;
  state.wpHit = [];
  ctx.save();
  // dotted path
  ctx.strokeStyle = 'rgba(108,140,255,.75)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8,7]);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, y);
  for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x, y);
  ctx.stroke();
  ctx.setLineDash([]);
  // start marker
  ctx.fillStyle = '#34d399';
  ctx.beginPath(); ctx.arc(pts[0].x, y, 9, 0, 7); ctx.fill();
  ctx.fillStyle='#06281c'; ctx.font='700 11px sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('S', pts[0].x, y+0.5);
  // waypoint markers
  pts.slice(1).forEach((p, i)=>{
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath(); ctx.arc(p.x, y, 11, 0, 7); ctx.fill();
    ctx.strokeStyle='#7c4a03'; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle='#3a2400'; ctx.font='700 12px sans-serif';
    ctx.fillText(String(i+1), p.x, y+0.5);
    const lbl = p.t.toFixed(1)+'s';
    ctx.font='600 11px sans-serif';
    const tw = ctx.measureText(lbl).width;
    ctx.fillStyle='rgba(0,0,0,.65)';
    ctx.fillRect(p.x-tw/2-5, y-36, tw+10, 18);
    ctx.fillStyle='#ffd88a';
    ctx.fillText(lbl, p.x, y-27);
    state.wpHit.push({instId: inst.id, idx: i, x: p.x, y});
  });
  ctx.restore();
}

// ---------- Draw ----------
let animT = 0;
function drawAnimOffset(anim, t, seed){
  const s = Math.sin, T = t/1000 + seed;
  switch(anim){
    case 'walk':      return {dy: Math.abs(s(T*7))*14, rot: s(T*7)*0.04};
    case 'jump':      { const ph=(T*1.2)%1; return {dy: -Math.sin(ph*Math.PI)*90, rot:0}; }
    case 'celebrate': { const ph=(T*1.6)%1; return {dy: -Math.abs(Math.sin(ph*Math.PI))*70, rot: s(T*10)*0.12}; }
    default:          return {dy: s(T*1.8)*5, rot: s(T*1.3)*0.015}; // idle breathing
  }
}

function draw(){
  const {w,h} = projSize();
  const sc = activeSceneObj();
  ctx.clearRect(0,0,w,h);
  if(!sc){ return; }

  // background (cover)
  const bg = BACKGROUNDS[sc.background];
  if (bg){
    const im = loadImg(bg.file);
    if ((im.complete && im.naturalWidth)){
      const s = Math.max(w/im.naturalWidth, h/im.naturalHeight);
      const dw = im.naturalWidth*s, dh = im.naturalHeight*s;
      ctx.drawImage(im, (w-dw)/2, (h-dh)/2, dw, dh);
    } else {
      ctx.fillStyle = '#1a1d26'; ctx.fillRect(0,0,w,h);
    }
  }

  // waypoint path overlay (edit mode, selected character)
  state.wpHit = [];
  if (!state.playing){
    const sel = sc.characters.find(c=>c.id===state.selectedChar);
    if (sel && ((sel.waypoints&&sel.waypoints.length) || state.wpMode)) drawWaypointPath(sel);
  }

  // characters sorted by y
  const chars = [...sc.characters].sort((a,b)=>a.y-b.y);
  chars.forEach((inst, i)=>{
    const def = charDef(inst);
    // waypoint playback position (during preview)
    let ex = inst.x, moving = false, mdx = 0;
    if (state.playing && state.playElapsed!=null){
      const wp = waypointPos(inst, state.playElapsed);
      ex = wp.x; moving = wp.moving; mdx = wp.dx;
    }
    const effAnim = moving ? 'walk' : inst.anim;
    const effFlip = moving ? (mdx < 0) : inst.flip;
    const b = spriteBox(Object.assign({}, inst, {x: ex}));
    const off = drawAnimOffset(effAnim, animT, i*1.7);
    ctx.save();
    ctx.translate(ex, inst.y + off.dy);
    ctx.rotate(off.rot);
    if (effFlip) ctx.scale(-1,1);
    const isSel = inst.id===state.selectedChar;
    if (def.kind==='animal'){
      ctx.font = `${b.w}px serif`;
      ctx.textAlign='center'; ctx.textBaseline='bottom';
      ctx.fillText(def.emoji, 0, 6);
    } else if (def.file){
      const im = loadImg(def.file);
      if (im.complete && im.naturalWidth){
        ctx.drawImage(im, -b.w/2, -b.h, b.w, b.h);
      } else {
        ctx.fillStyle='#3a4152'; ctx.fillRect(-b.w/2,-b.h,b.w,b.h);
      }
    }
    if (isSel){
      ctx.strokeStyle = '#6c8cff'; ctx.lineWidth = 3;
      ctx.setLineDash([10,6]);
      ctx.strokeRect(-b.w/2-8, -b.h-8, b.w+16, b.h+16);
      ctx.setLineDash([]);
    }
    ctx.restore();
    // name tag (unflipped, drawn outside the flip transform)
    if (isSel){
      ctx.save();
      ctx.translate(ex, inst.y + off.dy);
      ctx.font = `600 ${Math.max(20,h*0.022)}px sans-serif`;
      const tw = ctx.measureText(def.name).width;
      ctx.fillStyle='rgba(108,140,255,.92)';
      const ty=-b.h-44;
      ctx.fillRect(-tw/2-10, ty-24, tw+20, 34);
      ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(def.name, 0, ty-7);
      ctx.restore();
    }
  });

  // subtle ground shadow for selected
  updateSubtitle();
}

// ---------- FX layer: weather particles + emoji/bubble overlays ----------
// Drawn on #fxCanvas (above #stage, below UI). Weather is deterministic:
// same scene-time => same frame, so preview === render === HTML export.
function syncFxEngine(){
  if (!fxEngine) return;
  const sc = activeSceneObj();
  fxEngine.setWeather(sc ? sc.weather : null);
}
function overlayAt(px, py){
  const sc = activeSceneObj(); if(!sc || !sc.overlays) return null;
  for (let i = sc.overlays.length - 1; i >= 0; i--){
    const ov = sc.overlays[i];
    const r = (ov.size || 64) / 2 + 14;
    if (Math.abs(px - ov.x) <= r && Math.abs(py - ov.y) <= r) return ov;
  }
  return null;
}
function rrPath(c, x, y, w, h, r){
  r = Math.min(r, w/2, h/2);
  c.beginPath();
  c.moveTo(x+r, y);
  c.arcTo(x+w, y, x+w, y+h, r);
  c.arcTo(x+w, y+h, x, y+h, r);
  c.arcTo(x, y+h, x, y, r);
  c.arcTo(x, y, x+w, y, r);
  c.closePath();
}
function drawOverlaysFx(c, overlays, t, W, H, editMode){
  if (!overlays || !overlays.length) return;
  overlays.forEach(ov=>{
    if (!editMode && (t < (ov.t0 || 0) || t > (ov.t1 == null ? 1e9 : ov.t1))) return;
    const size = ov.size || 64;
    const ox = ov.x == null ? W/2 : ov.x, oy = ov.y == null ? H/2 : ov.y;
    const isSel = ov.id === state.selectedOverlay;
    if (ov.type === 'emoji'){
      c.save();
      c.font = size + 'px serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(ov.value || '✨', ox, oy);
      c.restore();
    } else {
      // speech / thought / shout bubble
      const style = ov.value || 'speech';
      const fs = Math.max(14, Math.round(size * 0.34));
      c.save();
      c.font = '600 ' + fs + 'px sans-serif';
      const tw = c.measureText(ov.text || '').width;
      const pw = tw + size * 0.9, ph = fs * 2.1;
      const bx = ox - pw/2, by = oy - ph/2;
      if (style === 'shout'){ c.fillStyle = '#ffeb3b'; c.strokeStyle = '#d32f2f'; c.lineWidth = 4; }
      else { c.fillStyle = 'rgba(255,255,255,0.96)'; c.strokeStyle = '#9aa0b4'; c.lineWidth = 2; }
      if (style === 'thought') c.setLineDash([8, 6]);
      rrPath(c, bx, by, pw, ph, size * 0.25);
      c.fill(); c.stroke(); c.setLineDash([]);
      // tail
      c.fillStyle = style === 'shout' ? '#ffeb3b' : 'rgba(255,255,255,0.96)';
      c.beginPath();
      c.moveTo(ox - 14, by + ph - 2); c.lineTo(ox + 14, by + ph - 2); c.lineTo(ox - 26, by + ph + 30);
      c.closePath(); c.fill();
      if (style === 'thought'){
        c.beginPath(); c.arc(ox - 34, by + ph + 42, 7, 0, 7); c.fill();
        c.beginPath(); c.arc(ox - 46, by + ph + 58, 4.5, 0, 7); c.fill();
      }
      c.fillStyle = '#23262e';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(ov.text || '', ox, oy);
      c.restore();
    }
    if (isSel && editMode){
      c.save();
      c.strokeStyle = '#6c8cff'; c.lineWidth = 2;
      c.setLineDash([8, 5]);
      const r = size/2 + 14;
      c.strokeRect(ox - r, oy - r, r*2, r*2);
      c.setLineDash([]);
      c.restore();
    }
  });
}
function drawFxLayer(ts){
  if (!fxEngine) return;
  const sc = activeSceneObj(); if(!sc) return;
  const {w, h} = projSize();
  syncFxEngine();
  // scene-time for deterministic weather: playback position, else wall-clock
  const t = (state.playing && state.playElapsed != null)
    ? state.playElapsed
    : (ts - fxT0) / 1000;
  const c2 = fxCanvas.getContext('2d');
  c2.clearRect(0, 0, w, h);
  if (fxEngine.hasActive()) WeatherEngine.drawWeather(c2, sc.weather, t, w, h);
  drawOverlaysFx(c2, sc.overlays, t, w, h, !state.playing);
}
let fxT0 = performance.now();

function updateSubtitle(){
  const sc = activeSceneObj();
  $('#subtitleBar').textContent = (state.playing && sc && sc.dialogue) ? sc.dialogue : (sc?.dialogue || '');
  $('#sceneLabel').textContent = `Scene ${state.activeScene+1} / ${state.project.scenes.length}`;
}

// ---------- Animation loop ----------
let lastFrame = 0;
function loop(ts){
  animT = ts;
  if (state.playing){
    const sc = state.project.scenes[state.playSceneIdx];
    if (sc){
      const el = (ts - state.playT0)/1000;
      state.playElapsed = el;
      if (el >= sc.duration){
        // next scene
        if (state.playSceneIdx < state.project.scenes.length-1){
          state.playSceneIdx++;
          state.activeScene = state.playSceneIdx;
          state.playT0 = ts;
          syncProps(); renderTimeline();
        } else {
          stopPreview(); toast('Preview xong');
        }
      }
    }
  }
  draw();
  drawFxLayer(ts);
  requestAnimationFrame(loop);
}

// ---------- Canvas mouse: select + drag ----------
function charAt(px,py){
  const sc = activeSceneObj(); if(!sc) return null;
  const chars=[...sc.characters].sort((a,b)=>b.y-a.y); // top-most first
  return chars.find(c=>hitChar(c,px,py)) || null;
}
canvas.addEventListener('mousedown', (e)=>{
  if (e.button !== 0) return; // left button only (right-click is for waypoint delete)
  const p = toProj(e);
  // waypoint add: Shift+Click or waypoint mode, with a character selected
  if ((e.shiftKey || state.wpMode) && !state.playing){
    const inst = getSelChar();
    if (inst){ addWaypoint(inst, p.x); return; }
  }
  // overlay (emoji/bubble) hit first — topmost layer
  if (!state.playing){
    const ovHit = overlayAt(p.x, p.y);
    if (ovHit){
      state.selectedOverlay = ovHit.id;
      state.dragOverlay = ovHit;
      state.dragOffset = {x: ovHit.x - p.x, y: ovHit.y - p.y};
      canvas.style.cursor = 'move';
      if (state.libTab === 'fx') renderLibrary();
      draw();
      return;
    }
    state.selectedOverlay = null;
  }
  const hit = charAt(p.x,p.y);
  if (hit){
    state.selectedChar = hit.id;
    state.dragChar = hit;
    state.dragOffset = {x: hit.x-p.x, y: hit.y-p.y};
    canvas.style.cursor='grabbing';
  } else {
    state.selectedChar = null;
  }
  syncProps(); draw();
});
canvas.addEventListener('contextmenu', (e)=>{
  e.preventDefault();
  if (state.playing) return;
  const p = toProj(e);
  const m = wpHitAt(p.x, p.y);
  if (m){
    const inst = activeSceneObj()?.characters.find(c=>c.id===m.instId);
    if (inst && inst.waypoints){
      inst.waypoints.splice(m.idx, 1);
      sortWps(inst);
      syncWaypointList(); draw(); renderTimeline();
      toast('Đã xóa waypoint');
    }
  }
});
window.addEventListener('mousemove', (e)=>{
  if (state.dragOverlay){
    const r = canvas.getBoundingClientRect();
    if (e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) return;
    const p = toProj(e);
    const {w,h} = projSize();
    state.dragOverlay.x = Math.round(Math.min(w,Math.max(0,p.x+state.dragOffset.x)));
    state.dragOverlay.y = Math.round(Math.min(h,Math.max(0,p.y+state.dragOffset.y)));
    return; // fx layer redraws every frame via loop()
  }
  if (!state.dragChar) return;
  const r = canvas.getBoundingClientRect();
  if (e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) return;
  const p = toProj(e);
  const {w,h} = projSize();
  state.dragChar.x = Math.round(Math.min(w,Math.max(0,p.x+state.dragOffset.x)));
  state.dragChar.y = Math.round(Math.min(h,Math.max(0,p.y+state.dragOffset.y)));
  syncCharProps(); draw();
});
window.addEventListener('mouseup', ()=>{ state.dragChar=null; state.dragOverlay=null; canvas.style.cursor='default'; });

// drop from library
canvas.addEventListener('dragover', (e)=>{ e.preventDefault(); e.dataTransfer.dropEffect='copy'; });
canvas.addEventListener('drop', (e)=>{
  e.preventDefault();
  try{
    const {kind, key} = JSON.parse(e.dataTransfer.getData('text/plain'));
    const p = toProj(e);
    const sc = activeSceneObj(); if(!sc) return;
    const inst = newCharInstance(kind==='animals'?'animal:'+key:key, Math.round(p.x), Math.round(p.y));
    sc.characters.push(inst);
    state.selectedChar = inst.id;
    syncProps(); draw();
    toast('Đã thêm vào scene');
  }catch(err){}
});

document.addEventListener('keydown', (e)=>{
  const tag = document.activeElement?.tagName;
  if (tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') return;
  if ((e.key==='Delete'||e.key==='Backspace') && state.selectedOverlay){
    const sc = activeSceneObj();
    if (sc){
      sc.overlays = (sc.overlays||[]).filter(o=>o.id!==state.selectedOverlay);
      state.selectedOverlay = null;
      if (state.libTab==='fx') renderLibrary();
      renderTimeline(); toast('Đã xóa overlay');
      return;
    }
  }
  if ((e.key==='Delete'||e.key==='Backspace') && state.selectedChar){
    deleteSelectedChar();
  }
});
function deleteSelectedChar(){
  const sc = activeSceneObj(); if(!sc||!state.selectedChar) return;
  const def = charDef(sc.characters.find(c=>c.id===state.selectedChar));
  sc.characters = sc.characters.filter(c=>c.id!==state.selectedChar);
  state.selectedChar = null;
  syncProps(); draw(); toast('Đã xóa: '+(def?.name||''));
}

// ---------- Properties panel ----------
function syncProps(){
  const sc = activeSceneObj();
  // bg options (build once)
  const bgSel = $('#propBg');
  if (!bgSel.options.length){
    for (const [k,v] of Object.entries(BACKGROUNDS)){
      const o=document.createElement('option'); o.value=k; o.textContent=v.name; bgSel.appendChild(o);
    }
  }
  if (sc){
    bgSel.value = sc.background;
    $('#propDur').value = sc.duration;
    $('#durVal').textContent = sc.duration;
    $('#propMusic').value = sc.music;
    if (document.activeElement!==$('#propDialogue')) $('#propDialogue').value = sc.dialogue;
  }
  syncCharProps();
  updateTotal();
}
function syncCharProps(){
  const sc = activeSceneObj();
  const inst = sc?.characters.find(c=>c.id===state.selectedChar);
  $('#charProps').style.display = inst ? 'block' : 'none';
  if (!inst) return;
  const def = charDef(inst);
  $('#charPropName').textContent = def.name;
  if (document.activeElement!==$('#propX')) $('#propX').value = Math.round(inst.x);
  if (document.activeElement!==$('#propY')) $('#propY').value = Math.round(inst.y);
  $('#propScale').value = inst.scale;
  $('#scaleVal').textContent = Number(inst.scale).toFixed(1);
  $('#propFlip').checked = inst.flip;
  $('#propAnim').value = inst.anim;
  syncWaypointList();
}
function getSelChar(){ return activeSceneObj()?.characters.find(c=>c.id===state.selectedChar); }

function syncWaypointList(){
  const inst = getSelChar();
  const list = $('#wpList');
  if (!list) return;
  list.innerHTML = '';
  const wps = inst?.waypoints || [];
  const modeBtn = $('#btnWpMode');
  if (modeBtn) modeBtn.classList.toggle('active', !!state.wpMode);
  if (!wps.length){
    list.innerHTML = '<div class="wp-empty">Chưa có waypoint — nhân vật đứng yên.</div>';
    return;
  }
  wps.forEach((wp, i)=>{
    const row = document.createElement('div');
    row.className = 'wp-row';
    row.innerHTML = `
      <span class="wp-num">${i+1}</span>
      <label>X <input type="number" data-i="${i}" data-k="x" value="${Math.round(wp.x)}" step="10"></label>
      <label>t(s) <input type="number" data-i="${i}" data-k="t" value="${wp.t}" step="0.5" min="0"></label>
      <button class="btn small danger" data-del="${i}" title="Xóa waypoint">×</button>`;
    list.appendChild(row);
  });
  list.querySelectorAll('input').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      const c2 = getSelChar(); if(!c2 || !c2.waypoints) return;
      const i = +inp.dataset.i, k = inp.dataset.k;
      const sc = activeSceneObj(); const {w} = projSize();
      if (k==='x') c2.waypoints[i].x = Math.round(Math.min(w, Math.max(0, +inp.value||0)));
      else c2.waypoints[i].t = Math.min(sc.duration, Math.max(0, +inp.value||0));
      sortWps(c2); syncWaypointList(); draw(); renderTimeline();
    });
  });
  list.querySelectorAll('[data-del]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const c2 = getSelChar(); if(!c2 || !c2.waypoints) return;
      c2.waypoints.splice(+btn.dataset.del, 1);
      sortWps(c2); syncWaypointList(); draw(); renderTimeline();
      toast('Đã xóa waypoint');
    });
  });
}
$('#btnWpMode')?.addEventListener('click', ()=>{
  state.wpMode = !state.wpMode;
  $('#btnWpMode').classList.toggle('active', state.wpMode);
  toast(state.wpMode ? '📍 Chế độ waypoint: click trên canvas để thêm điểm' : 'Đã tắt chế độ waypoint');
  draw();
});
$('#btnWpClear')?.addEventListener('click', ()=>{
  const inst = getSelChar(); if(!inst) return;
  inst.waypoints = [];
  syncWaypointList(); draw(); renderTimeline();
  toast('Đã xóa hết waypoints');
});

$('#propBg').addEventListener('change', e=>{ activeSceneObj().background=e.target.value; draw(); renderTimeline(); });
$('#propDur').addEventListener('input', e=>{ activeSceneObj().duration=+e.target.value; $('#durVal').textContent=e.target.value; renderTimeline(); renderAudioTimeline(); updateTotal(); });
$('#propMusic').addEventListener('change', e=>{ activeSceneObj().music=e.target.value; });
$('#propDialogue').addEventListener('input', e=>{ activeSceneObj().dialogue=e.target.value; updateSubtitle(); });
$('#propX').addEventListener('input', e=>{ const c=getSelChar(); if(c){c.x=+e.target.value||0; draw();} });
$('#propY').addEventListener('input', e=>{ const c=getSelChar(); if(c){c.y=+e.target.value||0; draw();} });
$('#propScale').addEventListener('input', e=>{ const c=getSelChar(); if(c){c.scale=+e.target.value; $('#scaleVal').textContent=(+e.target.value).toFixed(1); draw();} });
$('#propFlip').addEventListener('change', e=>{ const c=getSelChar(); if(c){c.flip=e.target.checked; draw();} });
$('#propAnim').addEventListener('change', e=>{ const c=getSelChar(); if(c){c.anim=e.target.value; draw();} });
$('#btnDelChar').addEventListener('click', deleteSelectedChar);

// ---------- Timeline ----------
function renderTimeline(){
  const tl = $('#timeline'); tl.innerHTML='';
  state.project.scenes.forEach((sc, i)=>{
    const d = document.createElement('div');
    d.className = 'scene-block'+(i===state.activeScene?' active':'');
    const bg = BACKGROUNDS[sc.background];
    const wpCount = sc.characters.reduce((a,c)=>a+((c.waypoints||[]).length),0);
    const sfxCount = (sc.sfx||[]).length;
    const wpDots = sc.characters.flatMap(c=>(c.waypoints||[]))
      .map(wp=>`<span class="wp-dot" style="left:${(wp.t/sc.duration*100).toFixed(1)}%"></span>`).join('');
    d.innerHTML = `
      <button class="s-del" title="Xóa scene">×</button>
      <img class="thumb" src="${bg?bg.file:''}" alt="">
      <div class="s-title">${i+1}. ${escHtml(sc.dialogue?.split('\n')[0]||'(chưa có thoại)')}</div>
      <div class="s-meta">⏱ ${sc.duration}s • 🧍 ${sc.characters.length}${wpCount?` • 📍 ${wpCount}`:''}${sfxCount?` • 🔊 ${sfxCount}`:''} • 🎵 ${sc.music}</div>
      ${wpDots?`<div class="wp-strip" title="${wpCount} waypoints">${wpDots}</div>`:''}
      <div class="s-nav">
        <button data-a="left" title="Sang trái">◀</button>
        <button data-a="dup" title="Nhân bản">⧉</button>
        <button data-a="right" title="Sang phải">▶</button>
      </div>`;
    d.addEventListener('click', (e)=>{
      if (e.target.closest('.s-del')){ delScene(i); return; }
      const a = e.target.closest('.s-nav button')?.dataset.a;
      if (a==='left'&&i>0){ moveScene(i,i-1); return; }
      if (a==='right'&&i<state.project.scenes.length-1){ moveScene(i,i+1); return; }
      if (a==='dup'){ dupScene(i); return; }
      selectScene(i);
    });
    d.querySelector('.s-del').addEventListener('click', (e)=>{ e.stopPropagation(); delScene(i); });
    tl.appendChild(d);
  });
  updateTotal();
}
function escHtml(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function selectScene(i){
  state.activeScene=i; state.selectedChar=null; state.selectedOverlay=null;
  syncProps(); renderTimeline(); renderAudioTimeline(); draw();
}
function moveScene(from,to){
  const s=state.project.scenes;
  [s[from],s[to]]=[s[to],s[from]];
  state.activeScene=to; syncProps(); renderTimeline(); draw();
}
function delScene(i){
  if (state.project.scenes.length<=1){ toast('Phải giữ ít nhất 1 scene'); return; }
  state.project.scenes.splice(i,1);
  if (state.activeScene>=state.project.scenes.length) state.activeScene=state.project.scenes.length-1;
  state.selectedChar=null; syncProps(); renderTimeline(); draw(); toast('Đã xóa scene');
}
function dupScene(i){
  const copy = JSON.parse(JSON.stringify(state.project.scenes[i]));
  copy.id = nid('s');
  copy.characters.forEach(c=>c.id=nid('c'));
  state.project.scenes.splice(i+1,0,copy);
  state.activeScene=i+1; state.selectedChar=null;
  syncProps(); renderTimeline(); draw(); toast('Đã nhân bản scene');
}
function updateTotal(){
  const t = state.project.scenes.reduce((a,s)=>a+s.duration,0);
  $('#totalDur').textContent = `Tổng: ${t}s • ${state.project.scenes.length} scenes`;
}

// ---------- Audio timeline (SFX per scene) ----------
function renderAudioTimeline(){
  const el = $('#audioTimeline');
  const nameEl = $('#audioSceneName');
  if (!el) return;
  const sc = activeSceneObj();
  if (nameEl) nameEl.textContent = sc ? `Scene ${state.activeScene+1}` : '—';
  el.innerHTML = '';
  if (!sc){ el.innerHTML = '<div class="audio-empty">Chưa có scene</div>'; return; }
  if (!Array.isArray(sc.sfx)) sc.sfx = [];
  if (!sc.sfx.length){
    el.innerHTML = '<div class="audio-empty">Chưa có SFX — mở tab 🔊 SFX trong thư viện, double-click để thêm</div>';
    return;
  }
  const dur = sc.duration || 10;
  // ruler
  const ruler = document.createElement('div');
  ruler.className = 'audio-ruler';
  for (let s = 0; s <= dur; s += Math.max(1, Math.round(dur/10))){
    const tick = document.createElement('span');
    tick.style.left = (s/dur*100)+'%';
    tick.textContent = s+'s';
    ruler.appendChild(tick);
  }
  el.appendChild(ruler);
  const lane = document.createElement('div');
  lane.className = 'audio-lane';
  sc.sfx.forEach(clip=>{
    const info = (typeof SFXEngine !== 'undefined') ? SFXEngine.info(clip.key) : null;
    const cDur = clip.loop ? dur - clip.t0 : (clip.dur || 2);
    const left = Math.min(100, clip.t0/dur*100);
    const width = Math.min(100 - left, Math.max(3, cDur/dur*100));
    const d = document.createElement('div');
    d.className = 'audio-clip' + (clip.loop ? ' loop' : '');
    d.style.left = left+'%'; d.style.width = width+'%';
    d.title = `${clip.name} — bắt đầu ${clip.t0}s`;
    d.innerHTML = `
      <span class="ac-name">🔊 ${escHtml(clip.name)}</span>
      <span class="ac-t">${clip.t0.toFixed(1)}s</span>
      <button class="ac-play" title="Nghe thử">▶</button>
      <button class="ac-del" title="Xóa">×</button>
      <div class="ac-vol" title="Âm lượng"><input type="range" min="0" max="100" value="${clip.volume}"></div>`;
    // play single
    d.querySelector('.ac-play').addEventListener('click', (e)=>{
      e.stopPropagation();
      if (sfxEngine) sfxEngine.play(clip.key, clip.volume/100);
    });
    // delete
    d.querySelector('.ac-del').addEventListener('click', (e)=>{
      e.stopPropagation();
      sc.sfx = sc.sfx.filter(x=>x.id!==clip.id);
      renderAudioTimeline(); renderTimeline(); toast('Đã xóa SFX');
    });
    // volume
    d.querySelector('.ac-vol input').addEventListener('input', (e)=>{
      clip.volume = +e.target.value;
    });
    d.querySelector('.ac-vol input').addEventListener('click', (e)=>e.stopPropagation());
    // drag to change t0
    d.addEventListener('mousedown', (e)=>{
      if (e.target.closest('button') || e.target.closest('input')) return;
      e.preventDefault();
      const laneRect = lane.getBoundingClientRect();
      const startX = e.clientX, startT0 = clip.t0;
      const mv = (e2)=>{
        const dx = (e2.clientX - startX) / laneRect.width * dur;
        clip.t0 = Math.max(0, Math.min(dur - 0.1, +(startT0 + dx).toFixed(1)));
        d.style.left = Math.min(100, clip.t0/dur*100)+'%';
        d.querySelector('.ac-t').textContent = clip.t0.toFixed(1)+'s';
      };
      const up = ()=>{
        document.removeEventListener('mousemove', mv);
        document.removeEventListener('mouseup', up);
        renderAudioTimeline();
      };
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup', up);
    });
    lane.appendChild(d);
  });
  el.appendChild(lane);
}
let _mixHandle = null;
function togglePreviewMix(){
  const btn = $('#btnPreviewMix');
  if (_mixHandle){ _mixHandle.stop(); _mixHandle = null; sfxEngine?.stopAll(); btn.textContent = '▶ Nghe thử mix'; return; }
  const sc = activeSceneObj();
  if (!sc || !(sc.sfx||[]).length){ toast('Scene này chưa có SFX'); return; }
  _mixHandle = sfxEngine.playMix(sc.sfx, sc.duration);
  btn.textContent = '⏹ Dừng';
  setTimeout(()=>{ if (_mixHandle){ _mixHandle = null; btn.textContent = '▶ Nghe thử mix'; } }, (sc.duration+1)*1000);
}
$('#btnAddScene').addEventListener('click', ()=>{
  state.project.scenes.push(newScene());
  state.activeScene = state.project.scenes.length-1;
  state.selectedChar=null; syncProps(); renderTimeline(); draw();
  toast('Đã thêm scene '+(state.activeScene+1));
});
$('#btnDupScene').addEventListener('click', ()=>dupScene(state.activeScene));
$('#btnDelScene').addEventListener('click', ()=>delScene(state.activeScene));

// ---------- Preview ----------
function startPreview(){
  if (!state.project.scenes.length) return;
  state.playing = true;
  state.playSceneIdx = 0; state.activeScene = 0;
  state.playT0 = performance.now();
  $('#btnPreview').disabled = true; $('#btnStop').disabled = false;
  syncProps(); renderTimeline();
  toast('▶ Đang preview...');
}
function stopPreview(){
  state.playing = false;
  state.playElapsed = null;
  state.selectedChar = null;
  $('#btnPreview').disabled = false; $('#btnStop').disabled = true;
  syncProps(); renderTimeline(); draw();
}
$('#btnPreview').addEventListener('click', startPreview);
$('#btnStop').addEventListener('click', ()=>{ stopPreview(); toast('Đã dừng'); });

// ---------- Export / Import JSON ----------
function exportJSON(){
  const data = JSON.stringify(state.project, null, 2);
  const blob = new Blob([data], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (state.project.title||'doodle-story').replace(/[^\w\- ]+/g,'').trim().replace(/\s+/g,'-').toLowerCase()+'.json';
  a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
  toast('Đã xuất JSON 💾');
}
$('#btnExportJSON').addEventListener('click', exportJSON);

function validateProject(p){
  if (!p || typeof p!=='object') throw new Error('JSON không phải object');
  if (!Array.isArray(p.scenes) || !p.scenes.length) throw new Error('Thiếu mảng "scenes"');
  p.scenes.forEach((s,i)=>{
    if (!BACKGROUNDS[s.background]) s.background='bg-park';
    s.duration = Math.min(60, Math.max(1, +s.duration||10));
    s.music = s.music||'none'; s.dialogue = s.dialogue||'';
    if (!Array.isArray(s.characters)) s.characters=[];
    s.characters.forEach(c=>{
      c.x=+c.x||0; c.y=+c.y||0; c.scale=+c.scale||1;
      c.flip=!!c.flip; c.anim=ANIMS[c.anim]?c.anim:'idle';
      if(!c.id) c.id=nid('c');
      // sanitize waypoints: [{x, t}]
      if(!Array.isArray(c.waypoints)) c.waypoints=[];
      c.waypoints = c.waypoints
        .filter(wp=>wp && isFinite(+wp.x) && isFinite(+wp.t))
        .map(wp=>({
          x: Math.round(Math.min(4000, Math.max(0, +wp.x))),
          t: Math.min(s.duration, Math.max(0, +(+wp.t).toFixed(2))),
        }));
      c.waypoints.sort((a,b)=>a.t-b.t);
    });
    if(!s.id) s.id=nid('s');
    // sanitize weather: {rain,snow,fog,dust,leaves} 0-100
    if (!s.weather || typeof s.weather !== 'object') s.weather = {};
    WEATHER_IDS.forEach(k=>{
      let v = Math.round(+s.weather[k] || 0);
      s.weather[k] = v < 0 ? 0 : v > 100 ? 100 : v;
    });
    // sanitize overlays: [{id,type,value,text,x,y,size,t0,t1}]
    if (!Array.isArray(s.overlays)) s.overlays = [];
    s.overlays = s.overlays
      .filter(o=>o && typeof o === 'object')
      .map(o=>({
        id: o.id || nid('o'),
        type: o.type === 'bubble' ? 'bubble' : 'emoji',
        value: String(o.value || '✨'),
        text: String(o.text ?? o.value ?? '...'),
        x: Math.round(+o.x || 0),
        y: Math.round(+o.y || 0),
        size: Math.max(16, Math.min(400, Math.round(+o.size || 64))),
        t0: Math.max(0, +o.t0 || 0),
        t1: Math.max(0, o.t1 == null ? s.duration : +o.t1),
      }));
    // sanitize sfx clips: [{id, key, t0, volume, loop}]
    if (!Array.isArray(s.sfx)) s.sfx = [];
    const knownSfx = (k) => (typeof SFX_DUR !== 'undefined') && !!SFX_DUR[k];
    s.sfx = s.sfx
      .filter(x=>x && typeof x.key === 'string' && knownSfx(x.key))
      .map(x=>{
        const info = (typeof SFXEngine !== 'undefined') ? SFXEngine.info(x.key) : null;
        const vol = Number.isFinite(+x.volume) ? +x.volume : 80;
        return {
          id: x.id || nid('x'),
          key: x.key,
          name: info?.n || x.name || x.key,
          dur: SFX_DUR[x.key] || 2,
          t0: Math.min(s.duration, Math.max(0, +x.t0 || 0)),
          volume: Math.min(100, Math.max(0, vol)),
          loop: !!(x.loop ?? info?.loop),
        };
      });
  });
  if(!p.title) p.title='Câu chuyện';
  if(!/^\d+x\d+$/.test(p.size||'')) p.size='1920x1080';
  return p;
}
$('#btnImportJSON').addEventListener('click', ()=>$('#fileImport').click());
$('#fileImport').addEventListener('change', (e)=>{
  const f = e.target.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = ()=>{
    try{
      const p = validateProject(JSON.parse(r.result));
      state.project=p; state.activeScene=0; state.selectedChar=null;
      $('#projectTitle').value=p.title; $('#projectSize').value=p.size;
      stopPreview(); syncAll(); toast(`Đã import: ${p.scenes.length} scenes ✅`);
    }catch(err){ toast('Import lỗi: '+err.message); }
    e.target.value='';
  };
  r.readAsText(f);
});

// ---------- Export standalone HTML player ----------
function exportHTML(){
  const p = state.project;
  const payload = JSON.stringify(p).replace(/<\/script>/g,'<\\/script>');
  const html = `<!DOCTYPE html>
<html lang="vi"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(p.title)} — Doodle Studio</title>
<style>
  body{margin:0;background:#0b0d12;display:flex;flex-direction:column;align-items:center;min-height:100vh;color:#fff;font-family:sans-serif}
  h1{font-size:18px;margin:12px}
  #wrap{position:relative}
  canvas{background:#000;border-radius:8px;max-width:96vw;max-height:70vh}
  #sub{position:absolute;left:0;right:0;bottom:8px;text-align:center;font-weight:700;font-size:20px;text-shadow:0 2px 4px #000;padding:0 12px}
  #bar{margin:12px;display:flex;gap:8px;align-items:center}
  button{background:#6c8cff;border:none;color:#fff;padding:8px 18px;border-radius:8px;cursor:pointer;font-size:14px}
  #prog{width:min(720px,90vw);height:6px;background:#333;border-radius:3px;overflow:hidden}
  #fill{height:100%;width:0;background:#6c8cff}
</style></head><body>
<h1>${escHtml(p.title)}</h1>
<div id="wrap"><canvas id="c"></canvas><div id="sub"></div></div>
<div id="prog"><div id="fill"></div></div>
<div id="bar"><button id="play">▶ Phát</button><span id="t"></span></div>
<script>
const P=${payload};
const BG=${JSON.stringify(BACKGROUNDS)};
const HU=${JSON.stringify(HUMANS)};
const AN=${JSON.stringify(ANIMALS)};
const [W,H]=P.size.split('x').map(Number);
const cv=document.getElementById('c'),x=cv.getContext('2d'),sub=document.getElementById('sub');
cv.width=W;cv.height=H;
const cache={};
function img(s){if(!cache[s]){const i=new Image();i.src=s;cache[s]=i;}return cache[s];}
function off(a,t,sd){const s=Math.sin,T=t/1000+sd;
  if(a==='walk')return{dy:Math.abs(s(T*7))*14,r:s(T*7)*0.04};
  if(a==='jump'){const p=(T*1.2)%1;return{dy:-Math.sin(p*Math.PI)*90,r:0};}
  if(a==='celebrate'){const p=(T*1.6)%1;return{dy:-Math.abs(Math.sin(p*Math.PI))*70,r:s(T*10)*0.12};}
  return{dy:s(T*1.8)*5,r:s(T*1.3)*0.015};}
let si=0,t0=0,playing=false,raf=0;
function wpPos(c,el){
  const wps=(c.waypoints||[]).slice().sort((a,b)=>a.t-b.t);
  if(!wps.length||el==null)return{x:c.x,m:false,dx:0};
  const k=[{x:c.x,t:0}].concat(wps);
  if(el<=k[0].t)return{x:k[0].x,m:false,dx:0};
  for(let i=0;i<k.length-1;i++){const a=k[i],b=k[i+1];
    if(el>=a.t&&el<=b.t){if(b.t<=a.t)return{x:b.x,m:false,dx:0};
      let p=(el-a.t)/(b.t-a.t);p=p*p*(3-2*p);
      return{x:a.x+(b.x-a.x)*p,m:true,dx:b.x-a.x};}}
  return{x:k[k.length-1].x,m:false,dx:0};}
const drawWeather=(${typeof WeatherEngine!=='undefined' ? WeatherEngine.drawWeather.toString() : 'function(){ }'});
function rrP(c,px,py,pw,ph,r){r=Math.min(r,pw/2,ph/2);c.beginPath();c.moveTo(px+r,py);
  c.arcTo(px+pw,py,px+pw,py+ph,r);c.arcTo(px+pw,py+ph,px,py+ph,r);
  c.arcTo(px,py+ph,px,py,r);c.arcTo(px,py,px+pw,py,r);c.closePath();}
function drawOv(s,el){
  (s.overlays||[]).forEach(function(ov){
    if(el<(ov.t0||0)||el>(ov.t1==null?1e9:ov.t1))return;
    var size=ov.size||64,ox=ov.x==null?W/2:ov.x,oy=ov.y==null?H/2:ov.y;
    if(ov.type==='emoji'){x.font=size+'px serif';x.textAlign='center';x.textBaseline='middle';
      x.fillText(ov.value||'✨',ox,oy);}
    else{var st=ov.value||'speech',fs=Math.max(14,Math.round(size*0.34));
      x.font='600 '+fs+'px sans-serif';var tw=x.measureText(ov.text||'').width;
      var pw=tw+size*0.9,ph=fs*2.1,bx=ox-pw/2,by=oy-ph/2;
      if(st==='shout'){x.fillStyle='#ffeb3b';x.strokeStyle='#d32f2f';x.lineWidth=4;}
      else{x.fillStyle='rgba(255,255,255,0.96)';x.strokeStyle='#9aa0b4';x.lineWidth=2;}
      if(st==='thought')x.setLineDash([8,6]);
      rrP(x,bx,by,pw,ph,size*0.25);x.fill();x.stroke();x.setLineDash([]);
      x.fillStyle=st==='shout'?'#ffeb3b':'rgba(255,255,255,0.96)';
      x.beginPath();x.moveTo(ox-14,by+ph-2);x.lineTo(ox+14,by+ph-2);x.lineTo(ox-26,by+ph+30);
      x.closePath();x.fill();
      x.fillStyle='#23262e';x.textAlign='center';x.textBaseline='middle';x.fillText(ov.text||'',ox,oy);}
  });
}
function drawScene(s,t,el){
  const bg=BG[s.background],im=bg&&img(bg.file);
  if(im&&im.complete&&im.naturalWidth){const k=Math.max(W/im.naturalWidth,H/im.naturalHeight);
    x.drawImage(im,(W-im.naturalWidth*k)/2,(H-im.naturalHeight*k)/2,im.naturalWidth*k,im.naturalHeight*k);}
  else{x.fillStyle='#1a1d26';x.fillRect(0,0,W,H);}
  [...s.characters].sort((a,b)=>a.y-b.y).forEach((c,i)=>{
    const wp=wpPos(c,el),ea=wp.m?'walk':c.anim;
    const o=off(ea,t,i*1.7);x.save();x.translate(wp.x,c.y+o.dy);x.rotate(o.r);
    if(wp.m?wp.dx<0:c.flip)x.scale(-1,1);
    if(c.char.startsWith('animal:')){const e=AN[c.char.slice(7)];x.font=(150*c.scale)+'px serif';
      x.textAlign='center';x.textBaseline='bottom';x.fillText(e?e.emoji:'❓',0,6);}
    else{const f=HU[c.char]&&HU[c.char].file,ii=f&&img(f);
      if(ii&&ii.complete&&ii.naturalWidth){const dh=H*0.42*c.scale,dw=dh*600/900;
        x.drawImage(ii,-dw/2,-dh,dw,dh);}}
    x.restore();});
  try{drawWeather(x,s.weather||{},el,W,H);}catch(e){}
  drawOv(s,el);
  sub.textContent=s.dialogue||'';
  document.getElementById('t').textContent='Scene '+(si+1)+'/'+P.scenes.length;
}
function tick(t){
  const s=P.scenes[si],el=(t-t0)/1000;
  document.getElementById('fill').style.width=(100*(si+el/s.duration)/P.scenes.length)+'%';
  if(el>=s.duration){si++;if(si>=P.scenes.length){stop();return;}t0=t;}
  drawScene(P.scenes[si],t,el);raf=requestAnimationFrame(tick);
}
function stop(){playing=false;cancelAnimationFrame(raf);document.getElementById('play').textContent='▶ Phát lại';si=0;}
document.getElementById('play').onclick=()=>{if(playing)return;playing=true;si=0;t0=performance.now();
  document.getElementById('play').textContent='⏸ Đang phát';raf=requestAnimationFrame(tick);};
drawScene(P.scenes[0],0,0);
<\/script></body></html>`;
  const blob = new Blob([html], {type:'text/html'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'doodle-story.html';
  a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
  toast('Đã xuất HTML — đặt cạnh thư mục assets/ để chạy 🌐');
}
$('#btnExportHTML').addEventListener('click', exportHTML);

// ---------- MP4 render job (cho pipeline Playwright/ffmpeg) ----------
$('#btnRender').addEventListener('click', ()=>{
  const job = {
    job: 'doodle-render', version: 1,
    title: state.project.title, size: state.project.size,
    fps: 30, out: 'doodle-story.mp4',
    scenes: state.project.scenes.map(s=>({
      background: BACKGROUNDS[s.background]?.file || s.background,
      duration: s.duration, music: s.music, dialogue: s.dialogue,
      sfx: (s.sfx||[]).map(x=>({key:x.key, t0:x.t0, volume:x.volume, loop:x.loop})),
      weather: Object.assign({rain:0,snow:0,fog:0,dust:0,leaves:0}, s.weather),
      overlays: (s.overlays||[]).map(o=>({type:o.type, value:o.value, text:o.text,
        x:o.x, y:o.y, size:o.size, t0:o.t0, t1:o.t1})),
      characters: s.characters.map(c=>{
        const d = charDef(c);
        return {name:d.name, sprite:d.file||d.emoji, kind:d.kind,
                x:c.x, y:c.y, scale:c.scale, flip:c.flip, anim:c.anim,
                waypoints:(c.waypoints||[]).map(wp=>({x:wp.x, t:wp.t}))};
      }),
    })),
  };
  const blob = new Blob([JSON.stringify(job,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download='render-job.json'; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
  toast('Đã xuất render-job.json — dùng với doodle-anim Docker để render MP4 🎬', 3200);
});

// ---------- Toolbar misc ----------
$('#projectTitle').addEventListener('input', e=>{ state.project.title=e.target.value; });
$('#projectSize').addEventListener('change', e=>{
  state.project.size=e.target.value; state.selectedChar=null;
  fitCanvas(); draw(); toast('Đổi kích thước: '+e.target.value);
});
$('#btnNew').addEventListener('click', ()=>{
  if (confirm('Tạo dự án mới? Mọi thay đổi chưa lưu sẽ mất.')){ newProject(); toast('Dự án mới 🗑'); }
});
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click', ()=>{
  state.libTab=t.dataset.tab; renderLibrary();
}));

$('#btnPreviewMix').addEventListener('click', togglePreviewMix);

// ---------- Sync + init ----------
function syncAll(){ fitCanvas(); renderLibrary(); syncProps(); renderTimeline(); renderAudioTimeline(); draw(); }
window.addEventListener('resize', ()=>{ fitCanvas(); draw(); });

// sample starter content
function seedDemo(){
  const s1 = newScene({background:'bg-park', duration:8, music:'happy',
    dialogue:'An, Bình, Chi, Dũng — bốn người bạn thân!',
    weather:{rain:0, snow:0, fog:0, dust:0, leaves:30}});
  s1.characters.push(
    Object.assign(newCharInstance('an', 500, 880), {anim:'walk',
      waypoints:[{x:900,t:2},{x:500,t:4},{x:900,t:6}]}),
    Object.assign(newCharInstance('binh', 800, 900), {anim:'idle'}),
    Object.assign(newCharInstance('chi', 1100, 880), {anim:'walk', flip:true,
      waypoints:[{x:700,t:2.5},{x:1400,t:5}]}),
    Object.assign(newCharInstance('dung', 1400, 900), {anim:'idle'}),
    Object.assign(newCharInstance('animal:dog', 950, 950), {scale:0.8, anim:'walk'}),
  );
  const s2 = newScene({background:'bg-mountain', duration:8, music:'adventure',
    dialogue:'Cuối tuần này, chúng ta cùng nhau chinh phục đỉnh núi!',
    weather:{rain:0, snow:0, fog:45, dust:0, leaves:0}});
  s2.characters.push(
    Object.assign(newCharInstance('dung', 700, 880), {anim:'walk'}),
    Object.assign(newCharInstance('an', 950, 900), {anim:'walk'}),
    Object.assign(newCharInstance('animal:bird', 1300, 400), {scale:0.9, anim:'idle'}),
  );
  s2.overlays.push(Object.assign(newOverlay('emoji','⛰️', 960, 300), {size:96, t0:0, t1:8}));
  state.project.scenes = [s1, s2];
}

seedDemo();
syncAll();
requestAnimationFrame(loop);
setTimeout(()=>toast('💡 Kéo nhân vật từ thư viện vào canvas để bắt đầu!'), 600);
})();
