#!/bin/sh
# Copies the game files into the app. Run this after you change index.html, style.css or script.js.
# Usage: ./sync-web.sh /path/to/your/block-burst-folder
SRC="${1:-../block-burst}"
DEST="$(dirname "$0")/app/src/main/assets/www"
mkdir -p "$DEST"
cp "$SRC/index.html" "$SRC/style.css" "$SRC/script.js" "$DEST/"
echo "Copied game files into $DEST"
