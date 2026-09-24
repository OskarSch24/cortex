"""Reiter „Video“ (Remotion) im Dock.

/remotion öffnet den Reiter und meldet ihn dem Host; die Phasen (kein Projekt,
Einrichtung, Start) haben eigene Hinweise; läuft Studio, steht es als
Live-Vorschau im Rahmen; ein neu gerendertes Video schaltet auf „Fertig“ und
spielt im Player; Rendern, Finder und Sichern gehen an den Host. Auch im
Vollbild des Docks.

Mit CORTEX_REMOTION_PROJECT=<Projektordner mit node_modules> läuft im Rahmen
ein echtes Remotion Studio (nur 127.0.0.1), sonst eine Platzhalterseite.
"""
import base64
import os
import shutil
import subprocess
import time
from pathlib import Path
from playwright.sync_api import expect
from headless_browser import headless_browser

ROOT = Path(__file__).resolve().parents[1]
VSCODE = ROOT / 'engine' / 'packages' / 'vscode'
SHOTS = ROOT / 'docs' / 'screenshots' / 'remotion'
PROJECT = os.environ.get('CORTEX_REMOTION_PROJECT')
STILL = Path('/private/tmp/cortex-still-fixture.png')


def post(page, data):
    page.evaluate("(data) => window.dispatchEvent(new MessageEvent('message', {data}))", data)


def send(page, text):
    box = page.locator('.composer textarea').first
    box.click()
    box.fill(text)
    page.keyboard.press('Escape')  # die Befehlsliste unter dem Slash nähme Enter für sich
    box.press('Enter')


def host(page, kind):
    return page.evaluate('(kind) => (window.__hostMessages || []).filter(m => m.kind === kind)', kind)


def state(page, conv, phase, **extra):
    post(page, {'kind': 'remotionState', 'conversationId': conv, 'state': {'folder': '/demo/studio-website/videos/video-site', 'phase': phase, 'videos': [], **extra}})


studio = None
studio_url = 'http://127.0.0.1:4173/dev/vorschau-seite.html'
if PROJECT:
    env = {**os.environ, 'NODE_OPTIONS': f'--require "{VSCODE / "media" / "remotion" / "loopback.cjs"}"', 'BROWSER': 'none', 'CI': '1'}
    studio = subprocess.Popen(['npx', '--no-install', 'remotion', 'studio', '--no-open', '--port=3977'], cwd=PROJECT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for line in studio.stdout:
        if 'Local:' in line:
            studio_url = 'http://127.0.0.1:3977/'
            break

sample = VSCODE / 'dev' / '_remotion-test.mp4'
try:
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=2', '-pix_fmt', 'yuv420p', str(sample)], check=True)
    # Das Standbild so, wie der Host es liefert: QuickLook auf das Beispielvideo.
    subprocess.run(['/usr/bin/qlmanage', '-t', '-s', '480', '-o', '/private/tmp', str(sample)], check=True, capture_output=True)
    Path(f'/private/tmp/{sample.name}.png').replace(STILL)
    with headless_browser() as browser:
        page = browser.new_page(viewport={'width': 1710, 'height': 1074})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto('http://127.0.0.1:4173/dev/preview.html?mode=agent&scenario=conversation')
        page.wait_for_load_state('networkidle')
        page.locator('#harness').evaluate('(node) => node.remove()')
        conv = page.evaluate("() => document.querySelector('.cx-tree-task.active') ? 'site' : 'site'")

        # /remotion allein öffnet nur den Reiter, schickt nichts an das Modell.
        sent = len(host(page, 'send'))
        send(page, '/remotion')
        dock = page.get_by_role('complementary', name='Arbeitsbereich')
        expect(page.get_by_role('tab', name='Video')).to_have_attribute('aria-selected', 'true')
        assert len(host(page, 'send')) == sent
        watch = host(page, 'remotionWatch')
        assert watch and watch[-1] == {'kind': 'remotionWatch', 'conversationId': conv, 'open': True}, watch

        state(page, conv, 'empty')
        expect(dock.get_by_text('Noch kein Video')).to_be_visible()
        state(page, conv, 'installing')
        expect(dock.get_by_text('Projekt wird eingerichtet …')).to_be_visible()
        state(page, conv, 'starting')
        expect(dock.get_by_text('Vorschau startet …')).to_be_visible()
        state(page, conv, 'ready', studioUrl=studio_url)
        frame = dock.locator('iframe[title="Remotion Studio — Live-Vorschau"]')
        expect(frame).to_have_attribute('src', studio_url)
        if PROJECT:
            expect(page.frame_locator('iframe[title="Remotion Studio — Live-Vorschau"]').locator('body')).not_to_be_empty(timeout=20000)
            page.wait_for_timeout(2500)
        SHOTS.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(SHOTS / 'cortex-video-live.png'))

        # Ohne Text bleibt der Befehl im Eingabefeld stehen, statt zu verschwinden.
        expect(page.locator('.composer textarea')).to_have_value('/remotion ')

        # Ein angehängtes Video zeigt im Eingabefeld ein Standbild mit Abspielzeichen und ×.
        post(page, {'kind': 'attachments', 'paths': ['/Users/demo/Desktop/Chapter 01.mp4']})
        page.wait_for_function("() => (window.__hostMessages || []).some(m => m.kind === 'attachmentPreview' && m.path.endsWith('Chapter 01.mp4'))")
        still = 'data:image/png;base64,' + base64.b64encode(STILL.read_bytes()).decode()
        post(page, {'kind': 'attachmentPreview', 'path': '/Users/demo/Desktop/Chapter 01.mp4', 'src': still})
        tile = page.locator('.composer .attachment-row.has-preview.is-video')
        expect(tile).to_be_visible()
        expect(tile.locator('img')).to_have_attribute('src', still)
        box = tile.bounding_box()
        assert 110 < box['width'] < 135 and 110 < box['height'] < 135, box
        tile.hover()
        expect(tile.get_by_role('button', name='Remove Chapter 01.mp4')).to_be_visible()
        page.screenshot(path=str(SHOTS / 'cortex-anhang-video.png'), clip={'x': 250, 'y': 780, 'width': 900, 'height': 294})

        # Nur der Befehl plus angehängtes Video: das Material ist der Auftrag, die Nachricht geht hinaus.
        send(page, '/remotion')
        page.wait_for_function("(n) => (window.__hostMessages || []).filter(m => m.kind === 'send').length > n", arg=sent)
        last = host(page, 'send')[-1]
        assert last['text'] == '/remotion' and last['attachments'] == ['/Users/demo/Desktop/Chapter 01.mp4'], last
        sent = len(host(page, 'send'))

        # Mit Auftrag geht die Nachricht an das Modell, der Reiter bleibt.
        send(page, '/remotion 10 Sekunden Intro mit dem Titel „Studio“')
        page.wait_for_function("(n) => (window.__hostMessages || []).filter(m => m.kind === 'send').length > n", arg=sent)
        assert host(page, 'send')[-1]['text'].startswith('/remotion 10 Sekunden')

        # Rendern geht an den Host.
        dock.get_by_role('button', name='Rendern').click()
        assert host(page, 'remotionAction')[-1] == {'kind': 'remotionAction', 'conversationId': conv, 'action': 'render'}
        state(page, conv, 'ready', studioUrl=studio_url, render={'running': True, 'label': 'Intro: Bild 12 von 300'})
        expect(dock.get_by_text('Intro: Bild 12 von 300')).to_be_visible()
        expect(dock.get_by_role('button', name='Rendern')).to_be_disabled()

        # Das fertige Video holt den Reiter nach „Fertig“ und spielt im Player.
        video = {'name': 'Intro.mp4', 'file': 'out/Intro.mp4', 'url': 'http://127.0.0.1:4173/dev/_remotion-test.mp4', 'size': 1843200, 'mtime': int(time.time() * 1000)}
        state(page, conv, 'ready', studioUrl=studio_url, videos=[video], render={'running': False, 'label': 'Intro.mp4 fertig'})
        expect(dock.get_by_role('tab', name='Fertig · 1')).to_have_attribute('aria-selected', 'true')
        player = dock.locator('.cx-video-player video')
        expect(player).to_have_attribute('src', video['url'])
        page.wait_for_function("() => document.querySelector('.cx-video-player video').readyState >= 1")
        assert page.evaluate("() => document.querySelector('.cx-video-player video').duration") > 1.5
        expect(dock.get_by_text('1,8 MB')).to_be_visible()
        dock.get_by_role('button', name='Intro.mp4 im Finder zeigen').click()
        assert host(page, 'remotionAction')[-1] == {'kind': 'remotionAction', 'conversationId': conv, 'action': 'reveal', 'file': 'out/Intro.mp4'}
        dock.get_by_role('button', name='Intro.mp4 sichern').click()
        assert host(page, 'remotionAction')[-1]['action'] == 'saveAs'
        page.screenshot(path=str(SHOTS / 'cortex-video-fertig.png'))

        # Im Vollbild des Docks: Player groß, die Eingabe schwebt darüber.
        page.get_by_role('button', name='Vollbildmodus aktivieren').click()
        expect(page.get_by_role('button', name='Vollbildmodus beenden')).to_be_visible()
        page.wait_for_timeout(300)
        assert dock.bounding_box()['width'] > 1400
        dock.get_by_role('tab', name='Live').click()
        expect(frame).to_be_visible()
        if PROJECT:
            page.wait_for_timeout(1500)
        page.screenshot(path=str(SHOTS / 'cortex-video-vollbild.png'))
        page.get_by_role('button', name='Vollbildmodus beenden').click()

        # Reiter zu: der Host erfährt es und hält Studio nicht grundlos am Laufen.
        dock.get_by_role('button', name='Video schließen').click()
        page.wait_for_function("() => (window.__hostMessages || []).filter(m => m.kind === 'remotionWatch').at(-1).open === false")

        # Das Plus im Dock bietet das Video an.
        page.evaluate("() => window.dispatchEvent(new MessageEvent('message', {data:{kind:'toolbar', action:'files'}}))")
        page.get_by_role('button', name='Etwas hinzufügen').click()
        page.get_by_role('menuitem', name='Video (Remotion)').click()
        expect(page.get_by_role('tab', name='Video')).to_have_attribute('aria-selected', 'true')

        assert not errors, errors
        print('cortex_remotion_ui: ok' + (' (mit echtem Studio)' if PROJECT else ''))
finally:
    sample.unlink(missing_ok=True)
    STILL.unlink(missing_ok=True)
    if studio:
        studio.terminate()
        studio.wait(timeout=10)
