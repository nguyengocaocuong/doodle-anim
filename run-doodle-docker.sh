#!/bin/bash
# ============================================
# DOODLE-ANIM - Chạy bằng Docker (1 lệnh)
# ============================================
# Cách dùng:
#   chmod +x run-doodle-docker.sh
#   ./run-doodle-docker.sh
#
# Hoặc dùng fork của bạn:
#   ./run-doodle-docker.sh --fork
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

# Bước 1: Build image
echo ""
echo "📦 Bước 1: Build Docker image..."
if [ "$USE_FORK" = true ]; then
    echo "Dùng fork: nguyengocaocuong/doodle-anim"
    # Tạo Dockerfile tạm dùng fork
    cp Dockerfile Dockerfile.bak
    sed -i 's|feitangyuan/doodle-anim|nguyengocaocuong/doodle-anim|' Dockerfile
fi

docker build -t $IMAGE_NAME .

if [ "$USE_FORK" = true ]; then
    mv Dockerfile.bak Dockerfile
fi
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
    -v "$(pwd)/output:/app/output" \
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
if [ "$USE_FORK" = true ]; then
    echo "   http://localhost:$PORT/templates/animals.html (mới!)"
    echo "   http://localhost:$PORT/templates/diverse-humans.html (mới!)"
    echo "   http://localhost:$PORT/templates/vietnam-backgrounds.html (mới!)"
    echo "   http://localhost:$PORT/templates/showcase.html (mới!)"
fi
echo ""
echo "Dừng: docker stop $CONTAINER_NAME"
echo "Xem log: docker logs -f $CONTAINER_NAME"
