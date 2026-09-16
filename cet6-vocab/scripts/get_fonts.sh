#!/bin/bash
# Downloads the four open-licensed font families used by templates/styles.css into cet6-vocab/fonts/ (git-ignored).
# Noto CJK (OFL) · LXGW WenKai (OFL) · Charis SIL (OFL)
set -e
cd "$(dirname "$0")/../fonts" 2>/dev/null || { mkdir -p "$(dirname "$0")/../fonts"; cd "$(dirname "$0")/../fonts"; }
get() { [ -f "$2" ] && { echo "skip $2"; return; }; curl -sSL --max-time 900 -o "$2" "$1" && echo "OK $2 $(stat -c%s "$2")"; }
get https://raw.githubusercontent.com/notofonts/noto-cjk/main/Serif/SubsetOTF/SC/NotoSerifSC-Regular.otf NotoSerifSC-Regular.otf
get https://raw.githubusercontent.com/notofonts/noto-cjk/main/Serif/SubsetOTF/SC/NotoSerifSC-Bold.otf NotoSerifSC-Bold.otf
get https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf NotoSansSC-Regular.otf
get https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/SubsetOTF/SC/NotoSansSC-Bold.otf NotoSansSC-Bold.otf
get https://github.com/lxgw/LxgwWenKai/releases/download/v1.510/LXGWWenKai-Regular.ttf LXGWWenKai-Regular.ttf
get https://github.com/silnrsi/font-charis/releases/download/v6.200/CharisSIL-6.200.zip CharisSIL.zip
[ -d CharisSIL-6.200 ] || unzip -q -o CharisSIL.zip
echo done
