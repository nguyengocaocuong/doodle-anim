#!/bin/bash
# ============================================
# DOODLE-ANIM - Chạy bằng Docker (1 lệnh)
# ============================================
set -e

USE_FORK=false
if [ "$1" == "--fork" ]; then
    USE_FORK=true
fi

IMAGE_NAME="doodle-anim"
CONTAINER_NAME="doodle-anim-app"
PORT=8080

echo "🎨 Doodle-Anim Docker Setup"
echo "============================"

# Bước 1: Build image (Dockerfile nằm trong docker/)
echo ""
echo "📦 Bước 1: Build Docker image..."
cd docker

if [ "$USE_FORK" = true ]; then
    echo "Dùng fork: nguyengocaocuong/doodle-anim"
    REPO_URL="https://github.com/nguyengocaocuong/doodle-anim.git"
else
    echo "Dùng repo gốc: feitangyuan/doodle-anim"
    REPO_URL="https://github.com/feitangyuan/doodle-anim.git"
fi

docker build --build-arg REPO_URL="$REPO_URL" -t $IMAGE_NAME .

cd ..
echo "✅ Build xong"

# Bước 2: Dừng container cũ nếu có
echo ""
echo "🛑 Bước 2: Dọn container cũ..."
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

# Bước 3: Chạy container
echo ""
echo "🚀 Bước 3: Chạy container..."
docker run -d \
    --name $CONTAINER_NAME \
    -p $PORT:8080 \
    $IMAGE_NAME

echo ""
echo "✅ XONG! Mở browser:"
echo ""
echo "   http://localhost:$PORT/templates/doodle.html"
echo ""
echo "Các giao diện khác:"
echo "   http://localhost:$PORT/templates/faces.html"
echo "   http://localhost:$PORT/templates/friends.html"
echo "   http://localhost:$PORT/templates/explainer.html"
echo "   http://localhost:$PORT/templates/animals.html"
echo "   http://localhost:$PORT/templates/diverse-humans.html"
echo "   http://localhost:$PORT/templates/vietnam-backgrounds.html"
echo "   http://localhost:$PORT/templates/showcase.html"
echo ""
echo "Dừng: docker stop $CONTAINER_NAME"
echo "Xem log: docker logs -f $CONTAINER_NAME"
