#!/bin/bash

# Get local IP address (works on macOS)
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
PORT=${1:-8000}

if [ -z "$IP" ]; then
    echo "⚠️  Could not detect network IP. Using localhost."
    IP="localhost"
fi

# Function to check if port is available
check_port() {
    lsof -i ":$1" >/dev/null 2>&1
    return $?
}

# Find an available port starting from the requested one
ORIGINAL_PORT=$PORT
while check_port "$PORT"; do
    echo "⚠️  Port $PORT is in use, trying $((PORT + 1))..."
    PORT=$((PORT + 1))

    # Safety limit - don't try forever
    if [ $PORT -gt $((ORIGINAL_PORT + 100)) ]; then
        echo "❌ Could not find an available port after 100 attempts."
        exit 1
    fi
done

URL="http://${IP}:${PORT}"

echo ""
echo "🍺 BrewLingo Server"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📡 Network Address: $URL"
echo ""
echo "📱 Scan to open on your device:"
echo ""
qrencode -t ANSIUTF8 "$URL"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Press Ctrl+C to stop the server"
echo ""

python3 -m http.server "$PORT" --bind 0.0.0.0
