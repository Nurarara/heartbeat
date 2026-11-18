#!/bin/bash
# Builds Heartbeat.app for Apple silicon and Intel Macs (macOS 13+), signs it ad hoc (free) and zips it.
# Runs on a Mac (or GitHub's free macOS runners: .github/workflows/mac.yml). Output: clients/mac/dist/.
set -euo pipefail
cd "$(dirname "$0")"
VERSION=$(sed -n 's/^let appVersion = "\(.*\)"/\1/p' Heartbeat/main.swift)
rm -rf dist build && mkdir -p dist build
for arch in arm64 x86_64; do
  swiftc -O -target "$arch-apple-macos13" -framework AppKit -framework IOKit Heartbeat/main.swift -o "build/Heartbeat-$arch"
done
APP=dist/Heartbeat.app
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
lipo -create build/Heartbeat-arm64 build/Heartbeat-x86_64 -output "$APP/Contents/MacOS/Heartbeat"
sed "s/VERSION/$VERSION/g" Info.plist > "$APP/Contents/Info.plist"
# App icon from the shared 512px icon.
ICONSET=build/AppIcon.iconset; mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s ../android/store/icon-512.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  d=$((s*2)); [ $d -le 512 ] && sips -z $d $d ../android/store/icon-512.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
cp ../android/store/icon-512.png "$ICONSET/icon_512x512@2x.png"
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
# Ad-hoc signature: free, required for Apple silicon. (Not notarized: see clients/mac/README.md.)
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"
"$APP/Contents/MacOS/Heartbeat" --self-test
(cd dist && ditto -c -k --sequesterRsrc --keepParent Heartbeat.app Heartbeat-mac.zip)
SHA=$(shasum -a 256 dist/Heartbeat-mac.zip | cut -d' ' -f1)
printf '{\n  "version": "%s",\n  "url": "/downloads/Heartbeat-mac.zip",\n  "sha256": "%s"\n}\n' "$VERSION" "$SHA" > dist/mac.json
echo "Built Heartbeat for Mac $VERSION ($(du -h dist/Heartbeat-mac.zip | cut -f1))"
