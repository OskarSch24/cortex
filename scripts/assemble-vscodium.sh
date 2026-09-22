#!/usr/bin/env bash
# Build a personal Code-OSS app (VSCodium binary + branding + bundled extensions).
# Does not compile VS Code. Does not copy Cursor.app.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="$ROOT/.cache"
BRAND="$ROOT/brand"
CONFIG="$BRAND/config.json"
VERSION="${VSCODIUM_VERSION:-1.126.04524}"
ARCH="$(uname -m)"
case "$ARCH" in
  arm64) ZIP_ARCH="arm64" ;;
  x86_64) ZIP_ARCH="x64" ;;
  *) echo "unsupported arch: $ARCH" >&2; exit 1 ;;
esac

ZIP_NAME="VSCodium-darwin-${ZIP_ARCH}-${VERSION}.zip"
ZIP_PATH="$CACHE/$ZIP_NAME"
ZIP_URL="https://github.com/VSCodium/vscodium/releases/download/${VERSION}/${ZIP_NAME}"

NAME_SHORT="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["nameShort"])' "$CONFIG")"
APP_NAME="${NAME_SHORT}.app"
WORK="$CACHE/work"
APP="$WORK/$APP_NAME"
DEST="${1:-/Applications/$APP_NAME}"

python3 - <<'PY' "$CONFIG" >/dev/null
import json, sys
json.load(open(sys.argv[1]))
PY

mkdir -p "$CACHE" "$WORK"
if [[ ! -f "$ZIP_PATH" ]]; then
  echo "downloading $ZIP_URL"
  curl -L --fail -o "$ZIP_PATH" "$ZIP_URL"
fi

echo "unpacking VSCodium"
rm -rf "$WORK"
mkdir -p "$WORK"
ditto -x -k "$ZIP_PATH" "$WORK"
if [[ -d "$WORK/VSCodium.app" ]]; then
  mv "$WORK/VSCodium.app" "$APP"
elif [[ ! -d "$APP" ]]; then
  echo "expected VSCodium.app in zip" >&2
  ls "$WORK" >&2
  exit 1
fi

PRODUCT="$APP/Contents/Resources/app/product.json"
PLIST="$APP/Contents/Info.plist"
python3 - "$PRODUCT" "$CONFIG" <<'PY'
import json, sys
product_path, config_path = sys.argv[1], sys.argv[2]
product = json.load(open(product_path))
config = json.load(open(config_path))
# Branding. Leave extensionsGallery (Open VSX) so marketplace still works.
for key in (
    "nameShort", "nameLong", "applicationName", "dataFolderName",
    "darwinBundleIdentifier", "urlProtocol", "win32MutexName",
    "licenseName", "reportIssueUrl", "documentationUrl", "requestFeatureUrl",
):
    if key in config:
        product[key] = config[key]
# A personal build must not auto-update back into VSCodium branding.
product.pop("updateUrl", None)
product.pop("backupUpdateUrl", None)
json.dump(product, open(product_path, "w"), indent=2)
print(f"patched product.json → {product['nameLong']} ({product['dataFolderName']})")
PY

python3 - "$PLIST" "$CONFIG" <<'PY'
import json, plistlib, sys
plist_path, config_path = sys.argv[1], sys.argv[2]
config = json.load(open(config_path))
with open(plist_path, "rb") as f:
    plist = plistlib.load(f)
# Keep CFBundleName as VSCodium: Electron looks up
# "VSCodium Helper.app" from the compiled binary. Changing the name
# makes the process die with "Unable to find helper app".
# Dock / Finder / About use DisplayName.
plist["CFBundleDisplayName"] = config["nameLong"]
plist["CFBundleIdentifier"] = config["darwinBundleIdentifier"]
plist["CFBundleIconFile"] = "Code.icns"
schemes = plist.get("CFBundleURLTypes", [])
if schemes:
    schemes[0]["CFBundleURLName"] = config["darwinBundleIdentifier"]
    schemes[0]["CFBundleURLSchemes"] = [config["urlProtocol"]]
plist["CFBundleURLTypes"] = schemes
with open(plist_path, "wb") as f:
    plistlib.dump(plist, f)
print(f"patched Info.plist display → {plist['CFBundleDisplayName']} (internal name stays {plist.get('CFBundleName')})")
PY

if [[ -f "$BRAND/Code.icns" ]]; then
  cp "$BRAND/Code.icns" "$APP/Contents/Resources/Code.icns"
  # VSCodium also ships document icons; leave them unless we add our own.
fi

EXT_DIR="$APP/Contents/Resources/app/extensions"
mkdir -p "$EXT_DIR"
rm -rf "$EXT_DIR/theme-oskars"
cp -R "$ROOT/extensions/theme-oskars" "$EXT_DIR/theme-oskars"

ENGINE_SRC="${ENGINE_SRC:-$ROOT/engine/packages/vscode}"
if [[ ! -f "$ENGINE_SRC/package.json" ]]; then
  echo "Cortex engine missing: $ENGINE_SRC" >&2
  exit 1
fi
if [[ -f "$ENGINE_SRC/package.json" && -d "$ENGINE_SRC/dist" ]]; then
  echo "bundling Cortex"
  rm -rf "$EXT_DIR/cortex"
  mkdir -p "$EXT_DIR/cortex"
  cp "$ENGINE_SRC/package.json" "$EXT_DIR/cortex/"
  cp -R "$ENGINE_SRC/dist" "$EXT_DIR/cortex/dist"
  [[ -d "$ENGINE_SRC/media" ]] && cp -R "$ENGINE_SRC/media" "$EXT_DIR/cortex/media"
  [[ -d "$ENGINE_SRC/schemas" ]] && cp -R "$ENGINE_SRC/schemas" "$EXT_DIR/cortex/schemas"
  [[ -d "$ENGINE_SRC/templates" ]] && cp -R "$ENGINE_SRC/templates" "$EXT_DIR/cortex/templates"
  [[ -f "$ENGINE_SRC/LICENSE" ]] && cp "$ENGINE_SRC/LICENSE" "$EXT_DIR/cortex/"
  [[ -f "$ENGINE_SRC/README.md" ]] && cp "$ENGINE_SRC/README.md" "$EXT_DIR/cortex/"
else
  echo "Cortex engine not found at $ENGINE_SRC — skipping AI bundle" >&2
fi

# Electron uses package.name/app.getName() for its macOS Keychain service.
# Changing only Finder's display name leaves the app asking for VSCodium's key.
python3 "$ROOT/scripts/patch-electron-identity.py" "$APP" "$CONFIG"
python3 "$ROOT/scripts/patch-restart-command.py" "$APP"
python3 "$ROOT/scripts/patch-browser-design.py" "$APP"
python3 "$ROOT/scripts/patch-titlebar-menu.py" "$APP"
python3 "$ROOT/scripts/patch-empty-editor.py" "$APP"
python3 "$ROOT/scripts/patch-webview-drop.py" "$APP"

# CLI next to the binary (name from product.json applicationName)
APP_CLI="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["applicationName"])' "$CONFIG")"
BIN_DIR="$APP/Contents/Resources/app/bin"
if [[ -x "$BIN_DIR/codium" ]]; then
  ln -sfn codium "$BIN_DIR/$APP_CLI"
fi

# Keep helper names as "VSCodium Helper*.app" — that string is compiled into
# the Electron binary. Changing CFBundleName/helpers caused the crash dialog.
# After editing Info.plist/product.json the original signature is invalid
# (macOS error 163). Ad-hoc re-sign in place; do not rename helpers.
# A stable Apple signing identity keeps Keychain access stable across rebuilds.
SIGN_IDENTITY="${CORTEX_SIGN_IDENTITY:-$(security find-identity -v -p codesigning | awk '/Apple Development:|Developer ID Application:/ {print $2; exit}')}"
if [[ -z "$SIGN_IDENTITY" ]]; then
  echo "No stable signing identity found. Set CORTEX_SIGN_IDENTITY to sign this personal build." >&2
  exit 1
fi
echo "signing Cortex with a stable code-signing identity"
codesign --force --deep --sign "$SIGN_IDENTITY" --preserve-metadata=entitlements "$APP" >/dev/null
codesign --verify --deep --strict "$APP"
xattr -cr "$APP" 2>/dev/null || true

echo "installing → $DEST"
rm -rf "$DEST"
mkdir -p "$(dirname "$DEST")"
ditto "$APP" "$DEST"
codesign --verify --deep --strict "$DEST"
xattr -cr "$DEST" 2>/dev/null || true
# ditto übernimmt die Zeitstempel aus dem VSCodium-Zip, das Bundle trägt danach
# ein Datum von vor dem Build. Genau daran erkennt der Icon-Cache von macOS
# "unverändert" und zeigt weiter das alte App-Icon. Datum setzen und
# LaunchServices den Eintrag neu lesen lassen.
touch "$DEST"
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
[[ -x "$LSREGISTER" ]] && "$LSREGISTER" -f "$DEST" >/dev/null 2>&1 || true
# Sicherungsstände in ihrer Grenze halten. Ein unbegrenzter Stapel voller
# App-Bundles hatte .cache schon einmal auf 21 GB gebracht.
bash "$ROOT/scripts/snapshot-app.sh" --prune || true

echo "done: $DEST"
echo "data folder: ~/${NAME_SHORT} uses $(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["dataFolderName"])' "$CONFIG") — isolated from Cursor and VS Code"
