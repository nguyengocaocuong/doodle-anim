# 🎨 Doodle Studio — Visual Story Builder (Prototype)

Giao diện visual kiểu Canva để dựng video từ doodle-anim:
chọn nhân vật → chọn bối cảnh → viết script từng scene → nối timeline → preview/export.

## Chạy thử

Mở `index.html` bằng browser (Chrome/Edge):
```bash
# cách 1: mở trực tiếp
open index.html

# cách 2: serve qua HTTP (khuyên dùng)
python3 -m http.server 8000
# → http://localhost:8000
```

## Tính năng

| Khu vực | Chức năng |
|---|---|
| **Thư viện** (trái) | 6 tabs: 🧑 Nhân vật (10), 🐾 Động vật (5 emoji), 🏞️ Bối cảnh (10), ✨ FX (thời tiết + emoji), 🔊 SFX (35 hiệu ứng âm thanh), 🖼️ Đồ vật (102 props). Kéo-thả vào canvas, hoặc click để thêm nhanh |
| **Canvas** (giữa) | Preview scene. Kéo nhân vật/đồ vật để di chuyển, click để chọn, `Del` để xóa |
| **Thuộc tính** (phải) | Scene: bối cảnh, thời lượng, nhạc, lời thoại. Nhân vật: X/Y, tỉ lệ, lật ngang, animation. Đồ vật: X/Y, tỉ lệ |
| **Timeline** (dưới) | Thêm / xóa / nhân bản / sắp xếp scenes. Click để edit |
| **Audio Timeline** (dưới) | SFX clips của scene hiện tại: kéo để đổi thời điểm, slider âm lượng, ▶ nghe thử từng clip, ▶ Nghe thử mix |
| **Toolbar** | ▶ Preview (phát toàn bộ), 🌐 xuất HTML chạy độc lập, 💾/📂 xuất/nhập JSON, 🎬 xuất render-job cho MP4 |

## 🔊 SFX (hiệu ứng âm thanh)

35 presets tổng hợp trực tiếp bằng Web Audio — không cần file audio:
**Thiên nhiên** (mưa, sấm, gió, sóng biển...), **Động vật** (chim, ếch, gà...),
**Phương tiện** (xe máy, còi...), **Hành động** (bước chân, đấm, vỗ tay...),
**Huyền ảo** (chuông, phép thuật...), **Đám đông** (chợ, trống hội...), **Nhạc nền** (5 moods).

Cách dùng: mở tab 🔊 SFX → bấm ▶ nghe thử → **double-click** để thêm vào scene →
kéo clip trên Audio Timeline để chỉnh thời điểm → slider để chỉnh âm lượng.

Khi render MP4, `scripts/render-story.mjs` tự tổng hợp lại các SFX này bằng ffmpeg
(`scripts/sfx-synth.mjs`) và mix với nhạc nền — âm thanh trong video khớp với bản preview.

## Animation

Nhân vật có 4 kiểu chuyển động procedural: đứng yên (thở), đi bộ, nhảy, ăn mừng.
Động vật dùng emoji vẽ trực tiếp lên canvas.

## 🖼️ Đồ vật (Asset Library)

102 props vẽ tay phong cách doodle (nét wobble + màu watercolor), trong
`templates/assets/props/` + `studio/assets/props/`:

| Nhóm | Số lượng | Ví dụ |
|---|---|---|
| 🌿 Thiên nhiên | 22 | mặt trời (4 buổi), trăng, sao, mây, cầu vồng, 5 loại cây, 4 loại hoa |
| 🏠 Đồ gia dụng | 25 | tivi, tủ lạnh, máy giặt, điều hòa, quạt, bàn ghế, bếp, đèn |
| 🛵 Phương tiện | 15 | xe máy, xe đạp, ô tô, bus, thuyền, cầu, cột điện |
| 🏘️ Nhà cửa | 20 | nhà ống/cấp 4/sàn/rông, chợ, trường, chùa, giếng, ruộng |
| 🧰 Đồ dùng | 20 | nón lá, ô, ba lô, nông cụ, bàn thờ, trống, diều |

`catalog.json`: `{id, name, category, file, tags}` — tags tiếng Việt + tiếng Anh.

Cách dùng: mở tab 🖼️ Đồ vật → 🔍 tìm theo tên/tag → lọc theo nhóm →
**kéo thả** hoặc **click** để thêm vào canvas → kéo để di chuyển, panel
phải chỉnh X/Y/tỉ lệ, `Del` để xóa. Props được lưu trong project JSON,
xuất ra `render-job.json`, và render vào MP4 (dưới nhân vật, theo camera).

## Data model (JSON)

```json
{
  "title": "Câu chuyện",
  "size": "1920x1080",
  "scenes": [{
    "id": "s1", "background": "bg-park", "duration": 10,
    "music": "happy", "dialogue": "Xin chào!",
    "characters": [
      {"id":"c1","char":"an","x":500,"y":880,"scale":1.0,"flip":false,"anim":"walk"},
      {"id":"c2","char":"animal:dog","x":950,"y":950,"scale":0.8,"flip":false,"anim":"idle"}
    ]
  }]
}
```

Tương thích ý tưởng JSON → Flow của museflow: paste JSON → Import → dựng timeline tự động.

## Render MP4

Nút 🎬 MP4 xuất `render-job.json` — dùng với doodle-anim Docker/Playwright pipeline
(`~/workspace/doodle-anim-fork/docker/`) để render thành MP4 thật.

## Assets

`assets/` chứa PNG nhân vật (đã tách nền trong suốt bằng PIL) và backgrounds,
copy từ `~/workspace/doodle-project/` và `~/workspace/drama-project/`.

## Giới hạn prototype

- Chưa có undo/redo
- Chưa render MP4 trực tiếp trong browser (cần Playwright backend)
- Nhân vật là sprite tĩnh + animation procedural (không phải rig đầy đủ như doodle-anim engine)
