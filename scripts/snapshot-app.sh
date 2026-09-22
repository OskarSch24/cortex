#!/usr/bin/env bash
# Sicherungskopie der installierten App, die fast nichts kostet.
#
# Eine echte Kopie des Bundles sind ~600 MB. Auf APFS teilt sich ein Klon seine
# Blöcke mit dem Original und wächst nur dort, wo eine Datei geändert wird.
# Sicherungen werden nie geändert, also bleiben sie dauerhaft bei ~0 Byte.
# Gemessen auf dieser Platte: Klon 0 MB, echte Kopie 201 MB.
#
# Ohne Grenze wächst so ein Stapel trotzdem in der Anzahl: 36 von Hand
# angelegte Kopien hatten .cache einmal auf 21 GB gebracht. Deshalb räumt
# jeder Lauf ältere Stände über der Grenze in den Papierkorb — nie mit rm.
#
#   scripts/snapshot-app.sh [label]   Stand sichern und aufräumen
#   scripts/snapshot-app.sh --prune   nur aufräumen (ruft assemble.sh auf)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SNAPSHOTS="$ROOT/.cache/snapshots"
KEEP="${CORTEX_SNAPSHOT_KEEP:-2}"
APP="${CORTEX_APP:-/Applications/Cortex.app}"

prune() {
  [[ -d "$SNAPSHOTS" ]] || return 0
  local old
  old="$(ls -1t "$SNAPSHOTS" 2>/dev/null | tail -n +$((KEEP + 1)) || true)"
  [[ -z "$old" ]] && return 0
  local trash="$HOME/.Trash/kortex-snapshots-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$trash"
  while IFS= read -r name; do
    [[ -z "$name" ]] && continue
    mv "$SNAPSHOTS/$name" "$trash/"
    echo "  Papierkorb: $name"
  done <<<"$old"
}

if [[ "${1:-}" == "--prune" ]]; then
  prune
  exit 0
fi

if [[ ! -d "$APP" ]]; then
  echo "Keine installierte App unter $APP" >&2
  exit 1
fi

# Eine unlesbare oder unsignierte Quelle wäre keine Sicherung, sondern eine
# Fälschung von Sicherheit. Lieber abbrechen als Schrott aufheben.
if ! codesign --verify --deep --strict "$APP" 2>/dev/null; then
  echo "Signatur von $APP ist nicht gültig — nichts gesichert." >&2
  exit 1
fi

LABEL="$(printf '%s' "${1:-stand}" | tr -cs '[:alnum:]-' '-' | sed 's/-*$//')"
TARGET="$SNAPSHOTS/$(date +%Y%m%d-%H%M%S)-${LABEL:-stand}"
mkdir -p "$SNAPSHOTS"

# -c klont auf APFS statt zu kopieren. Fällt das Dateisystem darauf zurück
# (etwa auf einem externen HFS+-Volume), kopiert cp normal weiter — dann ist
# die Sicherung teuer, aber immer noch korrekt.
cp -Rc "$APP" "$TARGET" 2>/dev/null || cp -R "$APP" "$TARGET"
echo "gesichert: ${TARGET#"$ROOT"/}"
prune
