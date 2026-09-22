"""UI tests must never launch the user's desktop browser or show a Dock icon."""
import socket
import subprocess
import sys
import time
from contextlib import contextmanager
from pathlib import Path
from playwright.sync_api import Error, sync_playwright

PREVIEW_ROOT = Path(__file__).resolve().parent.parent / 'engine' / 'packages' / 'vscode'
PREVIEW_PORT = 4173


def _listening(port):
    with socket.socket() as sock:
        sock.settimeout(0.3)
        return sock.connect_ex(('127.0.0.1', port)) == 0


@contextmanager
def preview_server(port=PREVIEW_PORT):
    """Der Vorschau-Harness unter http://127.0.0.1:4173 — läuft er schon, wird er
    benutzt, sonst für die Dauer des Tests gestartet und danach beendet."""
    if _listening(port):
        yield
        return
    proc = subprocess.Popen(
        [sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1', '--directory', str(PREVIEW_ROOT)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        for _ in range(50):
            if _listening(port):
                break
            time.sleep(0.1)
        yield
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


@contextmanager
def headless_browser(port=PREVIEW_PORT):
    with preview_server(port), sync_playwright() as playwright:
        try:
            # With no channel or executable override, Playwright uses its
            # dedicated chromium-headless-shell, not Google Chrome.app.
            browser = playwright.chromium.launch(headless=True)
        except Error as error:
            raise RuntimeError(
                'Headless-Testlauf konnte nicht starten. Bei fehlender Runtime: '
                'python3 -m playwright install chromium-headless-shell. '
                'Keinen installierten Desktop-Browser als Ersatz starten.'
            ) from error
        try:
            yield browser
        finally:
            browser.close()
