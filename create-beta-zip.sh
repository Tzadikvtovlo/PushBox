#!/usr/bin/env bash
# PushBox - יצירת ZIP של גרסת הבטא בהורדות (Linux/macOS)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BETA_DIR="$SCRIPT_DIR/beta"
DEST_DIR="$HOME/Downloads"
ZIP_NAME="PushBox-v4.91-Beta.zip"
DEST_FILE="$DEST_DIR/$ZIP_NAME"

echo "========================================================="
echo "      PushBox - יצירת קובץ ZIP לגרסת בטא (Beta)"
echo "========================================================="

if [ ! -d "$BETA_DIR" ]; then
  echo "[שגיאה] תיקיית beta לא נמצאה בנתיב: $BETA_DIR"
  exit 1
fi

mkdir -p "$DEST_DIR"
rm -f "$DEST_FILE"

echo "[1/2] דוחס את קבצי הבטא..."
(cd "$BETA_DIR" && zip -r "$DEST_FILE" . -x "*.git*")

echo "[2/2] הושלם!"
echo "========================================================="
echo " [הצלחה!] קובץ ה-ZIP נוצר בתיקיית ההורדות:"
echo " $DEST_FILE"
echo "========================================================="
