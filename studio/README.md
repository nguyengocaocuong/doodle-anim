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
| **Thư viện** (trái) | 3 tabs: 🧑 Nhân vật (10), 🐾 Động vật (5 emoji), 🏞️ Bối cảnh (10). Kéo-thả vào canvas, hoặc click để thêm nhanh |
| **Canvas** (giữa) | Preview scene. Kéo nhân vật để di chuyển, click để chọn, `Del` để xóa |
| **Thuộc tính** (phải) | Scene: bối cảnh, thời lượng, nhạc, lời thoại. Nhân vật: X/Y, tỉ lệ, lật ngang, animation |
| **Timeline** (dưới) | Thêm / xóa / nhân bản / sắp xếp scenes. Click để edit |
| **Toolbar** | ▶ Preview (phát toàn bộ), 🌐 xuất HTML chạy độc lập, 💾/📂 xuất/nhập JSON, 🎬 xuất render-job cho MP4 |

## Animation

Nhân vật có 4 kiểu chuyển động procedural: đứng yên (thở), đi bộ, nhảy, ăn mừng.
Động vật dùng emoji vẽ trực tiếp lên canvas.

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
