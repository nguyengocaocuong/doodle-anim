# ============================================
# Doodle-Anim - Docker image
# Chạy: docker build -t doodle-anim . && docker run -p 8080:8080 doodle-anim
# ============================================
FROM node:20-slim

# Cài dependencies hệ thống
RUN apt-get update && apt-get install -y \
    ffmpeg \
    git \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Cài Playwright + Chromium
RUN npx -y playwright@latest install --with-deps chromium 2>/dev/null || \
    (npx -y playwright install chromium && \
     apt-get update && \
     npx -y playwright install-deps chromium && \
     rm -rf /var/lib/apt/lists/*)

WORKDIR /app

# Clone repo — chọn qua build arg REPO_URL (mặc định: fork có đầy đủ tính năng)
ARG REPO_URL=https://github.com/nguyengocaocuong/doodle-anim.git
RUN git clone --depth 1 ${REPO_URL} .

# Cài npm dependencies (playwright cho scripts/render-story.mjs)
RUN npm install

# Tạo server đơn giản để serve templates
RUN npm install -g http-server 2>/dev/null || true

EXPOSE 8080

# Script khởi động
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
