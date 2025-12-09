#!/bin/bash

# Get local IP address (works on macOS)
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
PORT=5173

if [ -z "$IP" ]; then
    echo "⚠️  Could not detect network IP. Using localhost."
    IP="localhost"
fi

URL="http://${IP}:${PORT}"

echo ""
echo "🍺 BrewLingo Dev Server"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📡 Network Address: $URL"
echo ""
echo "📱 Scan to open on your device:"
echo ""
qrencode -t ANSIUTF8 "$URL"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

npm run dev
