# Doodle-Anim Docker

Chạy doodle-anim bằng Docker — 1 lệnh là lên.

## Cách dùng

### Repo gốc:
```bash
chmod +x run-doodle-docker.sh
./run-doodle-docker.sh
```

### Fork của bạn (có thêm nhân vật mới):
```bash
./run-doodle-docker.sh --fork
```

### Mở giao diện:
- http://localhost:8080/templates/doodle.html — giao diện chính
- http://localhost:8080/templates/faces.html — tạo khuôn mặt
- http://localhost:8080/templates/friends.html — nhiều nhân vật
- http://localhost:8080/templates/explainer.html — explainer video
- http://localhost:8080/templates/cinematic_fable.html — cinematic

Nếu dùng `--fork`, thêm:
- http://localhost:8080/templates/animals.html — 🐱🐦🐰🐔
- http://localhost:8080/templates/diverse-humans.html — 👴👵👶🏃👩‍🏫🪖
- http://localhost:8080/templates/vietnam-backgrounds.html — 🏞️ VN
- http://localhost:8080/templates/showcase.html — demo tổng hợp

## Lệnh hữu ích

```bash
# Xem log
docker logs -f doodle-anim-app

# Dừng
docker stop doodle-anim-app

# Xóa và chạy lại
docker rm doodle-anim-app
./run-doodle-docker.sh --fork
```

## Files

- `Dockerfile` — image Node 20 + ffmpeg + Playwright Chromium
- `docker-entrypoint.sh` — serve templates qua HTTP port 8080
- `run-doodle-docker.sh` — script 1 lệnh build + run
