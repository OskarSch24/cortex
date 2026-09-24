#!/usr/bin/env python3
"""Findet ein Provisioning-Profil, mit dem Cortex Touch-ID-Passkeys speichern darf.

Aufruf: find-provisioning-profile.py <Team-ID> <Bundle-ID> <Schlüsselbundgruppe>

Gesucht wird in $CORTEX_PROVISIONING_PROFILE (falls gesetzt) und in den Ordnern,
in die Xcode Profile legt. Ein Profil passt, wenn es für dieses Team und diese
App gilt, noch nicht abgelaufen ist, diesen Mac enthält (oder alle Geräte) und
die Schlüsselbundgruppe erlaubt. Ausgabe: der Pfad des Profils, sonst nichts.
Das Skript liest nur; es meldet sich nirgends an und legt nichts an.
"""
import datetime
import fnmatch
import os
import plistlib
import subprocess
import sys
from pathlib import Path


def decode(path):
    try:
        raw = subprocess.run(['security', 'cms', '-D', '-i', str(path)], capture_output=True, check=True).stdout
        return plistlib.loads(raw)
    except (subprocess.CalledProcessError, plistlib.InvalidFileException, ValueError):
        return None


def this_mac():
    out = subprocess.run(['system_profiler', 'SPHardwareDataType'], capture_output=True, text=True).stdout
    for line in out.splitlines():
        if 'Provisioning UDID' in line:
            return line.split(':', 1)[1].strip()
    return ''


def fits(profile, team, bundle, group, mac):
    if team not in profile.get('TeamIdentifier', []):
        return False
    expires = profile.get('ExpirationDate')
    if expires and expires.replace(tzinfo=None) < datetime.datetime.utcnow():
        return False
    if 'OSX' not in profile.get('Platform', ['OSX']):
        return False
    entitlements = profile.get('Entitlements', {})
    app_id = entitlements.get('com.apple.application-identifier') or entitlements.get('application-identifier', '')
    if not fnmatch.fnmatch(f'{team}.{bundle}', app_id):
        return False
    if not any(fnmatch.fnmatch(group, allowed) for allowed in entitlements.get('keychain-access-groups', [])):
        return False
    return profile.get('ProvisionsAllDevices') or mac in profile.get('ProvisionedDevices', [])


def main():
    team, bundle, group = sys.argv[1:4]
    mac = this_mac()
    candidates = []
    if os.environ.get('CORTEX_PROVISIONING_PROFILE'):
        candidates.append(Path(os.environ['CORTEX_PROVISIONING_PROFILE']).expanduser())
    for folder in ('~/Library/Developer/Xcode/UserData/Provisioning Profiles', '~/Library/MobileDevice/Provisioning Profiles'):
        base = Path(folder).expanduser()
        if base.is_dir():
            candidates += sorted(base.glob('*.provisionprofile'), key=lambda p: p.stat().st_mtime, reverse=True)
    for path in candidates:
        profile = decode(path) if path.is_file() else None
        if profile and fits(profile, team, bundle, group, mac):
            print(path)
            return


if __name__ == '__main__':
    main()
