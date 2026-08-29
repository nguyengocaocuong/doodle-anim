---
name: doodle-anim
description: >
  Hand-drawn doodle character animation, 100% code (Canvas 2D), zero image assets.
  Two flavors: (1) light watercolor-paper style — procedurally generated sketch crowds
  (humans / blob monsters / ghosts) with scripted story beats and emotes;
  (2) Zenn-style dark explainer — narrated popular-science clips with keyframed
  camera moves, per-shot action beats, cross-dissolve cuts, plain karaoke
  captions and macOS TTS voiceover (EN + 中文). Swappable protagonist
  (dude/cat/dog/monster) via the `char` field; (3) cyberpunk anime-face
  generator sheets (faces.html); (4) naive doodle-friend generator sheets —
  "all my friends are made of javascript" style (friends.html).
  Use when the user asks for 手绘/涂鸦/简笔画 角色动画, doodle/sketch coded animation,
  科普动画/讲解视频/faceless explainer, storyboard-cut clips (分镜),
  or a stable/reproducible code-animation render pipeline (seeded, frame-exact).
---

# doodle-anim — 纯代码手绘角色动画管线

复刻自 X 上 @albertobeicas 的 "All JS painted, no assets" 涂鸦角色动画：
水彩纸背景 + 铅笔抖线 + 水彩晕染填充 + 参数化角色（人类/团子怪/幽灵）随机漫步。
全部 Canvas 2D 手绘，无素材、无外部依赖；渲染管线确定性（同 seed 逐帧字节一致）。

## 组成

- `templates/doodle.html` — 自包含动画页（引擎 + 角色 + 场景）。零依赖，双击可开。
- `templates/replica.html` — Alberto 阵容 1:1 临摹页（4:3，960x720）：铅笔细线 +
  定向排线，28 只手工设定（2 排人类/狗/猫/梦魇），每只原地 idle。
  换阵容改文件顶部 `ROWS` 的 spec 数组（纯数据，无逻辑）。
- `templates/explainer.html` — Zenn 风暗色科普解说引擎（角色注册表：dude/cat/dog/monster）。
- `templates/faces.html` — 赛博动漫脸生成器（种子化阵容表，4s 眨眼循环）。
- `templates/friends.html` — Threeaio 风涂鸦朋友生成器（奶油纸 + 抖线 +
  程序化五官/发型 + 随机名字 + NEUES BLATT 换一页）。
- `templates/mannay.html` — Mannay 风表现主义炭笔涂鸦头像生成器（牛皮纸底 +
  粗颗粒炭笔 + 密集卷毛云/排线/冷帽 + 黑眼窝/不对称眨眼 + 错位水彩印染，
  "// coding doodles" 风格）。
- `scripts/capture.mjs` — 确定性采集器：Playwright 按固定步长调 `window.__seek(t)`，
  `canvas.toDataURL` 逐帧抓 PNG（绕过合成器，像素级精确），再 ffmpeg 合成 MP4/GIF。
- `scripts/render-explainer.mjs` — 解说片全管线：TTS 配音定时间线 → 抓帧 → 混音合成。

要求：Node ≥ 18、Playwright（含 chromium）、ffmpeg。

## 快速开始

```bash
# 1) 实时预览（浏览器打开，?live 开启动画循环）
open templates/doodle.html?live

# 2) 渲染 12 秒 MP4（1280x720 @30fps，约 15 秒跑完）
node scripts/capture.mjs --page templates/doodle.html --out out/demo --fps 30 --dur 12 --seed 7

# 3) 快速看构图：低帧率短片段 + 保留帧
node scripts/capture.mjs --page templates/doodle.html --out out/t --fps 6 --dur 1 --keep-frames
```

## 参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `--seed` | 7 | 主种子。换了就是另一群角色、另一条走位 |
| `--count` | 9 | 角色数量（随机种类配比） |
| `--mix` | — | 显式配比，如 `human:5,blob:3,ghost:2`（覆盖 count） |
| `--story` | — | 叙事剧本：`scare` / `chase` / `gather` / `meet` / `roster`（见下文） |
| `--fps` | 30 | 帧率 |
| `--dur` | 12 | 时长（秒） |
| `--scale` | 1 | 高清渲染倍率（2 = 2560x1440） |
| `--format` | mp4 | `mp4` 或 `gif` |
| `--keep-frames` | off | 保留 PNG 序列（抽帧检查用） |

URL 参数（直接开页面时）：`?seed= &count= &mix= &story= &dur= &live`。

## 叙事剧本模式（story）

`--story <name>` 启用剧本：每个角色一条 beats 时间线，编译成与随机漫步相同的
闭式分段（确定性不变）。内置 4 个：`scare`（幽灵吓人）、`chase`（团子追人）、
`gather`（集合）、`meet`（相遇）。

特殊模式 `--story roster`：**阵容展示表**（复刻 Alberto 的 lineup 视频）——
人类两排 + 狗一排 + 猫一排 + 梦魇怪一排，每排一条抖线，所有角色原地
呼吸/眨眼/摇尾巴，~40% 的角色会错峰冒一个符号（音符/爱心/zzz）。
换 seed 就是另一套阵容：

```bash
node scripts/capture.mjs --page templates/doodle.html --out out/roster --story roster --seed 7 --dur 10
```

角色种类（`--mix` 和自定义剧本的 `kind` 都可用）：`human` / `blob` / `ghost` /
`cat` / `dog` / `nightmare` / `weirdo` / `oddhead`。猫狗是同一个 `Pet` 参数化类——耳朵
（立耳/垂耳/圆耳/双马尾）、毛色、斑纹（眼圈/面罩/背斑）、尾巴
（长/卷/摇/短桩）、项圈全部种子随机；`nightmare` 是 Blob 的暗黑变体
（深色晕染、角/尖刺、X 眼、缝合嘴）。

`weirdo` 是怪咖家族（丑萌设计感）：脸直接长在胶囊/梨子/豆子的融合身体上，
**每只只强化一个梗**——大鼻子/错位眼/大嘴/蠢帽子（小苗、天线、礼帽、
贝雷帽、卷毛、螺旋桨帽、莫西干、蝴蝶结、绷带），其余部位故意留白；
雀斑件（条纹衫/围巾/领结/创可贴）和习惯性小动作（摇摆/弹跳）再叠一层。
螺旋桨会一直转，小苗会晃。设计纪律：一个记忆点+大量留白，别堆料。

`oddhead` 是大头仔家族（Alberto 式丑萌）：**头占身高 60% + 梯形小身 +
大眼斜瞟**（瞳距/高低眼/瞳孔漂移全随机——呆滞感全靠眼睛），头发用
**铅笔锯齿排线**（messy/spiky/bowl/sidepart/buzz，clip 区域内 zigzag 笔触），
每只一个搞怪件：冲天辫/头巾/眼罩/护目镜/小胡子/大耳朵/大板牙/贝雷帽/
OK 绷/小皇冠/耳机/疤。

roster 模式加 `--rows <kind>` 可让某一种角色单独成页（如 `--rows weirdo`
= 一页 24 只怪咖）。

```bash
node scripts/capture.mjs --page templates/doodle.html --out out/s1 --story scare --dur 11
```

### 写自己的剧本

在 `templates/doodle.html` 的 `STORIES` 里加一条：

```js
mystory: { dur: 12, chars: [
  { kind:'blob', seed:7, h:120, beats: [
    { do:'enter', from:'left', to:[0.3,0.75], speed:100 },  // 进场
    { do:'waitEmote', what:'!', dur:0.8 },                  // 冒符号并等待
    { do:'run', to:[1.2,0.8], speed:200, emote:'sweat' },   // 奔跑离场（带汗滴）
  ]},
]},
```

### Beat 一览

| beat | 参数 | 说明 |
|---|---|---|
| `start` | `x, y, dir` | 初始站位（坐标见下） |
| `enter` | `from:left/right, to, speed` | 从屏外走入 |
| `walk` | `to, speed` | 走路 |
| `run` | `to, speed` | 奔跑（人类双臂挥舞、团子大跳、幽灵前倾） |
| `exit` | `side, speed, run` | 走出屏外 |
| `idle` | `dur` | 原地待 dur 秒 |
| `face` | `dir:1/-1` | 转身 |
| `emote` | `what, dur, at` | 头顶冒符号，**不推进时间轴** |
| `waitEmote` | `what, dur` | 冒符号并等它结束 |

通用参数：`at`（秒，把该 beat 推迟到绝对时刻，自动补 idle）；
`walk/run/enter/exit` 可加 `emote:'xxx'` 让符号覆盖整段移动。

坐标：`[fx, gy]` — `fx` = 画面宽的比例（0.5 = 正中，<0 或 >1 = 屏外），
`gy` = 地面纵深 0..1（0 = 地平线，1 = 最前景）。

符号库（`what`）：`'!'` `'?'` `'...'` `heart` `sweat` `anger` `zzz` `music`。

> 时间轴陷阱：`emote` 不推进该角色的时间轴——连续两个 `emote` 会叠在一起显示。
> 要顺序播放就写绝对 `at`，或用 `waitEmote`。

## 工作流（定制动画时）

1. **复制模板**到项目目录，改代码（见下方架构）。
2. **低帧率抽帧验证**：`--fps 6 --dur 1 --keep-frames`，用读图工具看帧，迭代到满意。
3. **全量渲染**：30fps + 目标时长。交付前抽 2-3 帧确认画质。

## 架构与定制点（doodle.html 内）

- **渲染原语**：`roughStroke`（双遍抖动描边，stroke 级 seed → 线条稳定不闪）、
  `washFill`（多层低透明度微扩多边形 → 水彩晕染+出血边）、`scribbleShadow`（涂鸦阴影）、
  `makePaper`（纸纹：颗粒 + 团块 + 暗角，一次性离屏生成）。
- **角色**：`Human`（头型/发型/眼/嘴/雀斑/眼镜/衬衫或裙子）、`Blob`（耳朵/角/尖刺、
  X 眼/牙/独眼/愤怒眉/缝合嘴，`nightmare` 变体）、`Ghost`（波浪底边）、
  `Pet`（猫/狗：耳型/毛色/斑纹/尾巴/项圈全随机）。构造器里全部是
  `rng.pick/range` —— 加特征就往列表加分支。
- **调色板**：顶部 `PALETTE` 常量，低饱和 pastel。
- **行为**：`buildTimeline` 生成 idle/walk 段落序列（目标点、速度、相位连续），
  `poseAt(t)` 闭式求值 —— 无积分累积，任意时刻 t 直接求姿态。
- **场景**：`CrowdScene` 管地平线、划痕、深度排序（按脚底 y 排序 + 缩放）。

## 科普解说片模式（explainer，Zenn 风格）

对标 YouTube 频道 Zenn（@Zenn0009）的 faceless 科普动画：暗色手绘场景 +
白色粗描边小人 + **关键帧运镜**（推/摇）+ 镜头内动作节拍 + 交叉溶解转场 +
底部纯白卡拉 OK 字幕 + 旁白配音。无花字黄字——叙事靠画面动作推进。

```bash
# 一条命令出片（TTS 配音 + 分镜 + 字幕 + 合成，全自动）
node scripts/render-explainer.mjs --script templates/story.example.json --out out/ep1
```

**story.json**：一个分镜数组，每镜头 `{ visual, line, char? }`：

- `visual`：镜头画面，必须是 `explainer.html` 里 `VISUALS` 注册表中的名字。
  内置场景：`bedroom` `crib` `photos` `brain` `neurons` `mirror` `endcard` `roster`
  + 通用场景 `park`（树下长椅）`street`（街道过车）`space`（星球宇航员）`lab`（实验台）
- `char`：可选，本镜主角，来自 `CHARACTERS` 注册表（默认 `dude` 白描边小人）：
  - `dude` — 默认小人（支持 `arm: down/point/scratch/wave/hold`、`arm2` 双臂组合）
  - `cat` — 白猫：立耳、胡须、尾巴慢摇；`dog` — 棕狗：垂耳、吻部、眼圈斑、快摇尾
    （猫狗共用 `Pet` 类，四足对角步态，支持 stand/walk/sit，忽略手臂动作）
  - `monster` — 梦魇怪：紫团子、双角、X 眼、缝合嘴，走路摇摆
  - `roster` 镜头会把全部角色排一排（验收/展示用）
- `line`：旁白文案。macOS `say` 合成语音，**镜头时长 = 语音时长 + 1s 余量**，
  字幕按 3 词一组随时间切换——音画天然同步。空 line → 4.2s 过场。

**通用道具**（写新场景直接用，都在 explainer.html 道具段）：`drawTree` `drawHouse`
`drawCar` `drawSun` `drawCloud` `drawPlanet` `drawTable` `drawFlask` `drawComputer`
`drawFlower` + 老道具 `drawMoon` `drawStar` `drawCrib` `drawMobile` `drawBrain`
`drawNeuron` `drawPhoto` `drawFire`。

可选参数：`--fps 30` `--voice Samantha`（用 `say -v '?'` 看可用声音）`--rate 150`（语速）。

**中文配音**：直接用中文写 `line` + 中文声音即可，例如
`--voice Tingting --rate 165`（`say -v '?' | grep zh_` 看全部中文声音：
Tingting 普通话女声、Meijia 台湾、Sinji 粤语等）。字幕自动识别：
无空格的 CJK 文案按标点断句、超过 8 字硬切分块；有空格的按 3 词一块。
参考 `templates/story.example.zh.json`。

**竖屏 9:16（Shorts/抖音/小红书）**：渲染加 `--size 720x1280`。
引擎自带竖版运镜（`CAMS_P` 表）与竖版布局修正；新场景记得按 W/H 比例写坐标，
px 级尺寸用 `Math.min(W,H)` 做基准。

**音频层（默认开）**：BGM 是程序合成的 lo-fi 垫（Am–F–C–G 软垫 + 空气噪，`audio.mjs`），
SFX 按场景节拍自动排（脚步/拾取/碎裂/打火/流星/气泡…，`synthSFX` 里的 per-visual
事件表）。`--no-bgm` / `--no-sfx` 可关。配音音量 1.6、BGM 0.30、SFX 0.85——
配音永远是主角。

**剧本工作流（两阶段，务必遵守）**：
1. **大纲先行**：拿到主题先写 story.json 草稿并向用户确认——分镜表格式：
   每镜一行 `visual | 画面动作beat | 台词`。台词中文 ≤14 字、英文 ≤10 词，
   7 镜以内讲完；遵循 Zenn 公式（钩子→证据→弹回观众）。
2. **确认后渲染**：先 `--preview --fps 8` 出无声草稿验证构图节奏（十几秒跑完），
   满意再全量 30fps + 配音渲染。

```bash
# 草稿预览（无配音，固定每镜 3.2s）
node scripts/render-explainer.mjs --script story.json --out out/draft --preview --fps 8

# 竖屏成片（中文配音 + BGM + SFX 全自动）
node scripts/render-explainer.mjs --script story.json --out out/ep2 \
  --size 720x1280 --voice Tingting --rate 165
```

**脚本公式**（拆解自 Zenn 全站剧本，务必遵循）：
1. 开场三拍：第二人称当下日常 → 反转（"but for 99.9% of history…"）→ 留个必须看完的钩子；
2. 正文挂真实研究/命名实验（Calhoun、Belyaev 这类），别编；
3. 收尾一句话把宏大话题弹回观众自己身上（"It was becoming *you*"）。

**镜头要有"动作节拍"，不是静态插画**：每个 visual 用 `u = t/sc.dur`（0..1）
编排小剧本——角色走进来、坐下、挠头；照片碎成粒子被吹走；插头够不到插座
打火、小人吓一跳；记忆星被新树突够到后消散。写新镜头时先想"这个镜头里
发生了什么动作"，再写绘制。

**运镜**：`CAMS` 注册表按 visual 存关键帧 `[[u, cx, cy, zoom], ...]`
（cx/cy = 画面宽/高比例，u = 镜头内进度），smoothstep 插值。在 story.json
里也可给单个镜头传 `cam` 字段覆盖。

**转场**：每个镜头结尾 0.45s 与下一镜头交叉溶解（自动，无需配置）。

**加新镜头画面**：在 `explainer.html` 的 `VISUALS` 加
`myscene(ctx, t, W, H, sc){...}`（`t` 是镜头内本地时间），用现有原语
（`roughStroke`/`shape`/`drawBaby`/`DUDE` 等）绘制，在 `CAMS` 加运镜、
在 `backdropFor` 的 `bases`/`seeds` 里补一对配色即可。`DUDE` 支持
`mode: stand/walk/sit/lie`、`arm: down/point/scratch/wave`、
`expr: neutral/confused/happy/shocked/sad`。

**验证流程**：先 `?live` 浏览器预览或低 fps 抽帧看构图，再整片渲染；
交付前抽查 2-3 帧 + 听一遍音画同步。

## 动漫脸生成器（faces.html，Kevin Ngo 风格）

赛博动漫头像阵容表：种子化脸型（尖下巴锥度）、7 种发型剪影
（bob/long/spiky/bangs/buzz/mohawk/ponytail）、3 种眼型（sharp/round/sleepy）、
赛博配件（眼镜/眼罩/visor 光带/护目镜/耳机/面罩）、排线阴影、错峰眨眼
（4s 整循环）。奶油纸底，同一套确定性契约（`__seek(t)` / `?live`）。

```bash
# 预览（实时）
open templates/faces.html'?live&seed=7&cols=6&rows=3'

# 渲染 8 秒（两个眨眼循环）
node scripts/capture.mjs --page templates/faces.html --out out/faces --fps 30 --dur 8

# 换一拨脸：改 seed；要大头特写：-- 参数 cols=3 rows=2
open templates/faces.html'?live&seed=42&cols=3&rows=2'
```

**加脸型/配件**：`AnimeFace` 构造器里全是 `rng.pick/range` 分支——
发型往 `hairPts()` 加分支，配件往 `draw()` 末尾的配件链加分支即可。

## 涂鸦朋友生成器（friends.html，Threeaio 风格）

复刻 @Threeaio 的 "all my friends are made of javascript"：奶油纸底 +
抖动墨线 + 淡彩皮肤，4×2 种子化涂鸦头像阵容——4 种头型 × 12 种发型
（秃头/圆寸/锅盖/刘海/偏分/双马尾/麻花辫/爆炸头/卷发/发髻/毛线帽/礼帽）
× 7 种眼型 × 小胡子/胡茬/雀斑/腮红 × 圆框方框眼镜/创可贴/耳环，
每只一个音节随机名（YUNKOLA 风）。等宽字体手写标题，底部
"NEUES BLATT" 按钮（live 模式点击或按任意键换新一页，即新 seed）。

```bash
# 预览（实时眨眼 + 瞳孔漂移，点按钮换阵容）
open templates/friends.html'?live&seed=7'

# 渲染 8 秒（两个眨眼循环）
node scripts/capture.mjs --page templates/friends.html --out out/friends --fps 30 --dur 8

# 换一页朋友 / 改阵容密度
open templates/friends.html'?live&seed=42&cols=4&rows=2'
```

**加特征**：`Friend` 构造器全是 `rng.pick/chance` 分支——发型往
`drawBackHair`/`drawFrontHair` 加分支，五官配件往 `draw()` 对应链加。

## 表现主义炭笔肖像生成器（mannay.html，Mannay 风格）

复刻 @mannay 的 "You can just draw faces with javascript // coding doodles"：
做旧牛皮纸底 + 粗粝炭笔线条 + 极端不对称表现主义造型。

- **发型库**：密集弹簧卷毛云（`curlyCloud`）、致密炭笔黑块（`solidCharcoal`）、
  斜向铅笔排线（`hatch`）、针织冷帽（`beanie`）、偏分后移发际线（`sidePart`）、点阵寸头（`stipple`）、稀疏呆毛（`wisps`）。
- **五官梗**：单侧黑眼窝炭笔晕染（`darkPatch`）、粗黑框/细双梁眼镜（`thickGlasses`/`wireGlasses`）、
  不对称眯眼/眨眼、X 眼神、单笔直角 L 鼻/长倒勾鼻、铅笔点阵胡子/粗炭条胡子。
- **色彩层**：版画式错位低饱和水彩块（陶土腮红、鼠尾草绿单耳、冷帽蓝调）。

```bash
# 实时预览（默认 6×4 肖像墙，点 NEW SHEET 或按任意键切下一组）
open templates/mannay.html'?live&seed=42'

# 导出 4 秒高清视频（1280x900 @30fps）
node scripts/capture.mjs --page templates/mannay.html --out out/mannay --fps 30 --dur 4 --seed 42

# 特写大图（3x2 或 2x2 网格）
open templates/mannay.html'?live&seed=7&cols=3&rows=2'
```

## 确定性契约（用这种管线写新动画必须遵守）

1. 一切随机数来自 seeded PRNG（`mulberry32` / `RNG`），**禁止** `Math.random()` / `Date.now()`。
2. 每根线条的抖动用 stroke 级 seed（如 `hash(characterId + strokeName)`），
   不要用每帧变化的随机 —— 否则画面会"煮面"式闪烁（除非就要 line-boil 效果）。
3. 姿态是时间 t 的纯函数：`pose = f(t)`。需要累积的过程（如漫游）改为
   预生成时间线 + 闭式查询，不要靠 rAF 逐帧积分。
4. 页面暴露 `window.__seek(tSeconds)` 渲染精确时刻 t 的一帧；
   实时预览走 `?live` 分支，与采集路径分开。
5. 验证确定性：同 seed 调两次 `__seek(t)`，`toDataURL` 结果必须字节相等。
6. **透明度一律乘法合成**：所有绘制 helper 里写 `ctx.globalAlpha *= a`，
   绝不直接赋值 —— 直接赋值会覆盖掉外层场景/转场的淡入淡出与溶解。
   （Canvas 的 globalAlpha 不随 save/restore 嵌套相乘，必须手动乘。）

## 故障排查

- 画面闪/线条抖：违反契约第 2 条，stroke seed 每帧变了。
- 角色叠在一起：初始位置用洗牌槽位（模板已内置），别用纯随机 x。
- Playwright 缺浏览器：`npx playwright install chromium`。
- gif 太大：降 fps 到 12-15，或 `--scale 0.75`。
