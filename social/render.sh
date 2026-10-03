#!/bin/sh
# Renders og-image.html to /assets/og-image.jpg (1200x630, the size every social platform shares).
set -e
cd "$(dirname "$0")"
chromium --headless=new --no-sandbox --hide-scrollbars --window-size=1200,630 --screenshot="$PWD/og-image.png" "file://$PWD/og-image.html" 2>/dev/null
python3 -c "from PIL import Image; Image.open('og-image.png').convert('RGB').save('../assets/og-image.jpg', quality=86, optimize=True, progressive=True)"
rm og-image.png
