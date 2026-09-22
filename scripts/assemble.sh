#!/usr/bin/env bash
# Build/package/sign the application-owned Electron host. Never opens a browser
# or Cortex. The old Code-OSS route lives in assemble-vscodium.sh only.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="/Applications/Cortex.app"
BUILD_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --build-only) BUILD_ONLY=1 ;;
    --help|-h) echo "Usage: bash scripts/assemble.sh [--build-only] [/absolute/path/Cortex.app]"; exit 0 ;;
    /*.app) DEST="$arg" ;;
    *) echo "Unbekanntes Argument: $arg" >&2; exit 1 ;;
  esac
done
PNPM="${CORTEX_PNPM:-$(command -v pnpm || true)}"
if [[ -z "$PNPM" && -x "$HOME/.local/bin/pnpm" ]]; then PNPM="$HOME/.local/bin/pnpm"; fi
if [[ -z "$PNPM" ]]; then echo "pnpm fehlt. Bitte zuerst die Projekt-Abhängigkeiten installieren." >&2; exit 1; fi
if [[ "$(uname -s)" != "Darwin" ]]; then echo "Cortex.app wird auf macOS gebaut." >&2; exit 1; fi
SIGN_IDENTITY="${CORTEX_SIGN_IDENTITY:-$(security find-identity -v -p codesigning | awk '/Apple Development:|Developer ID Application:/ {print $2; exit}')}"
if [[ -z "$SIGN_IDENTITY" || "$SIGN_IDENTITY" == "-" ]]; then echo "Keine stabile Apple-Signatur gefunden. CORTEX_SIGN_IDENTITY setzen." >&2; exit 1; fi

"$PNPM" -C "$ROOT/engine/packages/vscode" exec node esbuild.mjs --production
"$PNPM" -C "$ROOT/engine/packages/desktop" run build
"$PNPM" -C "$ROOT/engine/packages/desktop" run package
APP="$(python3 - "$ROOT/.cache/desktop-package-path.json" <<'PY'
import json, sys
print(json.load(open(sys.argv[1]))['app'])
PY
)"
if [[ ! -d "$APP" || "$APP" != "$ROOT/.cache/desktop/"*"/Cortex.app" ]]; then echo "Paketpfad ist ungültig: $APP" >&2; exit 1; fi
echo "Signiere eigenständiges Cortex.app mit stabiler Identität"
codesign --force --deep --sign "$SIGN_IDENTITY" --preserve-metadata=entitlements "$APP" >/dev/null
codesign --verify --deep --strict "$APP"
xattr -cr "$APP" 2>/dev/null || true
echo "Gebaut und signiert: $APP"
if [[ "$BUILD_ONLY" == 1 ]]; then exit 0; fi

# Do not replace resources underneath an open editor or unsaved draft.
target_is_running() {
  python3 - "$DEST" <<'PY'
import os, subprocess, sys
target = os.path.realpath(sys.argv[1]).rstrip('/') + '/Contents/'
processes = subprocess.check_output(['/bin/ps', '-axo', 'comm='], text=True)
raise SystemExit(0 if any(line.strip().startswith(target) for line in processes.splitlines()) else 1)
PY
}
if target_is_running; then
  echo "Cortex läuft noch. Die neue App ist fertig unter: $APP" >&2
  echo "Entwürfe speichern, Cortex vollständig beenden und die Installation erneut ausführen." >&2
  exit 2
fi
if [[ -e "$DEST" ]]; then CORTEX_APP="$DEST" bash "$ROOT/scripts/snapshot-app.sh" vor-eigenstaendiger-app; fi
mkdir -p "$(dirname "$DEST")"
STAGING="$(mktemp -d "$(dirname "$DEST")/.cortex-install.XXXXXX")"
PREVIOUS="$STAGING/Previous.app"
INSTALLED=0
restore() {
  local status=$?
  if [[ "$status" != 0 && -d "$PREVIOUS" ]]; then
    [[ ! -e "$DEST" ]] || rm -rf "$DEST"
    mv "$PREVIOUS" "$DEST"
  elif [[ "$status" != 0 && "$INSTALLED" == 1 ]]; then
    # A failed first installation must not leave an invalid app behind either.
    rm -rf "$DEST"
  fi
  rm -rf "$STAGING"
  exit "$status"
}
trap restore EXIT
ditto "$APP" "$STAGING/Cortex.app"
codesign --verify --deep --strict "$STAGING/Cortex.app"
# A user can start Cortex while the bundle is being copied. Recheck at the
# last possible moment and retain the already-built signed package.
if target_is_running; then
  echo "Cortex wurde während der Vorbereitung gestartet. Keine App ausgetauscht." >&2
  echo "Das fertige Paket bleibt unter: $APP" >&2
  exit 2
fi
[[ ! -e "$DEST" ]] || mv "$DEST" "$PREVIOUS"
mv "$STAGING/Cortex.app" "$DEST"
INSTALLED=1
codesign --verify --deep --strict "$DEST"
xattr -cr "$DEST" 2>/dev/null || true
touch "$DEST"
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
[[ ! -x "$LSREGISTER" ]] || "$LSREGISTER" -f "$DEST" >/dev/null 2>&1 || true
echo "Installiert: $DEST"
echo "Eigenständiger Cortex-Prozess und Cortex-Helper; keine VSCodium-Workbench."
echo "App und Browser wurden nicht gestartet."
