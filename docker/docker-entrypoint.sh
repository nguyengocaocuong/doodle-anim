#!/bin/bash
# ============================================
# Doodle-Anim Docker - Entrypoint
# Serve templates qua HTTP + sẵn sàng render
# ============================================
set -e

echo "🎨 Doodle-Anim Docker starting..."
echo ""
echo "📁 Templates:"
ls /app/templates/*.html 2>/dev/null | head -10
echo ""
echo "🌐 Server đang chạy tại: http://localhost:8080/templates/"
echo ""
echo "Mở các giao diện:"
echo "  - http://localhost:8080/templates/doodle.html"
echo "  - http://localhost:8080/templates/faces.html"
echo "  - http://localhost:8080/templates/friends.html"
echo "  - http://localhost:8080/templates/showcase.html (nếu dùng fork)"
echo ""

# Serve /app qua HTTP port 8080
cd /app
exec npx http-server -p 8080 --cors -c-1 2>/dev/null || \
     python3 -m http.server 8080
