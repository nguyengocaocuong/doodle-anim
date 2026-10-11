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
  playing: false,
  playSceneIdx: 0,
  playT0: 0,
  dragChar: null,
  dragOffset: {x:0, y:0},
  libTab: 'humans',
};

const $ = (s) => document.querySelector(s);
const canvas = $('#stage');
const ctx = canvas.getContext('2d');
const imgCache = {};

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
  }, over);
}
function newCharInstance(charKey, x, y){
  return { id: nid('c'), char: charKey, x, y, scale: 1.0, flip: false, anim: 'idle' };
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
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===state.libTab));
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

  // characters sorted by y
  const chars = [...sc.characters].sort((a,b)=>a.y-b.y);
  chars.forEach((inst, i)=>{
    const def = charDef(inst);
    const b = spriteBox(inst);
    const off = drawAnimOffset(inst.anim, animT, i*1.7);
    ctx.save();
    ctx.translate(inst.x, inst.y + off.dy);
    ctx.rotate(off.rot);
    if (inst.flip) ctx.scale(-1,1);
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
      ctx.translate(inst.x, inst.y + off.dy);
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
  requestAnimationFrame(loop);
}

// ---------- Canvas mouse: select + drag ----------
function charAt(px,py){
  const sc = activeSceneObj(); if(!sc) return null;
  const chars=[...sc.characters].sort((a,b)=>b.y-a.y); // top-most first
  return chars.find(c=>hitChar(c,px,py)) || null;
}
canvas.addEventListener('mousedown', (e)=>{
  const p = toProj(e);
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
window.addEventListener('mousemove', (e)=>{
  if (!state.dragChar) return;
  const r = canvas.getBoundingClientRect();
  if (e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) return;
  const p = toProj(e);
  const {w,h} = projSize();
  state.dragChar.x = Math.round(Math.min(w,Math.max(0,p.x+state.dragOffset.x)));
  state.dragChar.y = Math.round(Math.min(h,Math.max(0,p.y+state.dragOffset.y)));
  syncCharProps(); draw();
});
window.addEventListener('mouseup', ()=>{ state.dragChar=null; canvas.style.cursor='default'; });

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
  if ((e.key==='Delete'||e.key==='Backspace') && state.selectedChar){
    const tag = document.activeElement?.tagName;
    if (tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') return;
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
}
function getSelChar(){ return activeSceneObj()?.characters.find(c=>c.id===state.selectedChar); }

$('#propBg').addEventListener('change', e=>{ activeSceneObj().background=e.target.value; draw(); renderTimeline(); });
$('#propDur').addEventListener('input', e=>{ activeSceneObj().duration=+e.target.value; $('#durVal').textContent=e.target.value; renderTimeline(); updateTotal(); });
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
    d.innerHTML = `
      <button class="s-del" title="Xóa scene">×</button>
      <img class="thumb" src="${bg?bg.file:''}" alt="">
      <div class="s-title">${i+1}. ${escHtml(sc.dialogue?.split('\n')[0]||'(chưa có thoại)')}</div>
      <div class="s-meta">⏱ ${sc.duration}s • 🧍 ${sc.characters.length} • 🎵 ${sc.music}</div>
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
  state.activeScene=i; state.selectedChar=null;
  syncProps(); renderTimeline(); draw();
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
    });
    if(!s.id) s.id=nid('s');
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
function drawScene(s,t){
  const bg=BG[s.background],im=bg&&img(bg.file);
  if(im&&im.complete&&im.naturalWidth){const k=Math.max(W/im.naturalWidth,H/im.naturalHeight);
    x.drawImage(im,(W-im.naturalWidth*k)/2,(H-im.naturalHeight*k)/2,im.naturalWidth*k,im.naturalHeight*k);}
  else{x.fillStyle='#1a1d26';x.fillRect(0,0,W,H);}
  [...s.characters].sort((a,b)=>a.y-b.y).forEach((c,i)=>{
    const o=off(c.anim,t,i*1.7);x.save();x.translate(c.x,c.y+o.dy);x.rotate(o.r);
    if(c.flip)x.scale(-1,1);
    if(c.char.startsWith('animal:')){const e=AN[c.char.slice(7)];x.font=(150*c.scale)+'px serif';
      x.textAlign='center';x.textBaseline='bottom';x.fillText(e?e.emoji:'❓',0,6);}
    else{const f=HU[c.char]&&HU[c.char].file,ii=f&&img(f);
      if(ii&&ii.complete&&ii.naturalWidth){const dh=H*0.42*c.scale,dw=dh*600/900;
        x.drawImage(ii,-dw/2,-dh,dw,dh);}}
    x.restore();});
  sub.textContent=s.dialogue||'';
  document.getElementById('t').textContent='Scene '+(si+1)+'/'+P.scenes.length;
}
function tick(t){
  const s=P.scenes[si],el=(t-t0)/1000;
  document.getElementById('fill').style.width=(100*(si+el/s.duration)/P.scenes.length)+'%';
  if(el>=s.duration){si++;if(si>=P.scenes.length){stop();return;}t0=t;}
  drawScene(P.scenes[si],t);raf=requestAnimationFrame(tick);
}
function stop(){playing=false;cancelAnimationFrame(raf);document.getElementById('play').textContent='▶ Phát lại';si=0;}
document.getElementById('play').onclick=()=>{if(playing)return;playing=true;si=0;t0=performance.now();
  document.getElementById('play').textContent='⏸ Đang phát';raf=requestAnimationFrame(tick);};
drawScene(P.scenes[0],0);
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
      characters: s.characters.map(c=>{
        const d = charDef(c);
        return {name:d.name, sprite:d.file||d.emoji, kind:d.kind,
                x:c.x, y:c.y, scale:c.scale, flip:c.flip, anim:c.anim};
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

// ---------- Sync + init ----------
function syncAll(){ fitCanvas(); renderLibrary(); syncProps(); renderTimeline(); draw(); }
window.addEventListener('resize', ()=>{ fitCanvas(); draw(); });

// sample starter content
function seedDemo(){
  const s1 = newScene({background:'bg-park', duration:8, music:'happy',
    dialogue:'An, Bình, Chi, Dũng — bốn người bạn thân!'});
  s1.characters.push(
    Object.assign(newCharInstance('an', 500, 880), {anim:'walk'}),
    Object.assign(newCharInstance('binh', 800, 900), {anim:'idle'}),
    Object.assign(newCharInstance('chi', 1100, 880), {anim:'walk', flip:true}),
    Object.assign(newCharInstance('dung', 1400, 900), {anim:'idle'}),
    Object.assign(newCharInstance('animal:dog', 950, 950), {scale:0.8, anim:'walk'}),
  );
  const s2 = newScene({background:'bg-mountain', duration:8, music:'adventure',
    dialogue:'Cuối tuần này, chúng ta cùng nhau chinh phục đỉnh núi!'});
  s2.characters.push(
    Object.assign(newCharInstance('dung', 700, 880), {anim:'walk'}),
    Object.assign(newCharInstance('an', 950, 900), {anim:'walk'}),
    Object.assign(newCharInstance('animal:bird', 1300, 400), {scale:0.9, anim:'idle'}),
  );
  state.project.scenes = [s1, s2];
}

seedDemo();
syncAll();
requestAnimationFrame(loop);
setTimeout(()=>toast('💡 Kéo nhân vật từ thư viện vào canvas để bắt đầu!'), 600);
})();
