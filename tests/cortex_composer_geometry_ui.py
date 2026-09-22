"""Rendered corner/inset regression against the supplied 2x Codex references.

Measure pixels as well as layout: a circular 32px radius has the same bounding
box but fails these silhouette checks. Only the dedicated headless runtime runs.
"""
from io import BytesIO
from pathlib import Path
from PIL import Image
from playwright.sync_api import expect
from headless_browser import headless_browser

OUT = Path(__file__).resolve().parents[1] / 'docs/screenshots'
OUT.mkdir(exist_ok=True)
PORT = 4183


def close(actual, expected):
    assert abs(actual - expected) < .1, (actual, expected)


def outline(png):
    image = Image.open(BytesIO(png)).convert('RGB')
    # Measured leftmost solid edge at 2x: ordinary round corners deviate by
    # up to eight raster pixels here. Allow one antialiasing pixel.
    for y, expected in ((4, 33), (8, 24), (16, 14), (24, 8), (32, 4)):
        x = next(x for x in range(80) if min(image.getpixel((x, y))) > 45)
        assert abs(x - expected) <= 1, (y, x, expected)
    return image


with headless_browser(port=PORT) as browser:
    page = browser.new_page(viewport={'width': 1440, 'height': 950}, device_scale_factor=2)
    page.set_default_timeout(10000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(f'http://127.0.0.1:{PORT}/dev/preview.html?mode=agent')
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(e) => e.remove()')

    def emit(message):
        page.evaluate('data => window.dispatchEvent(new MessageEvent("message", {data}))', message)

    def seed(paths, text):
        emit({'kind': 'composerSeed', 'text': text, 'attachments': paths})
        expect(page.locator('.attachment-row')).to_have_count(len(paths))
        for path in paths:
            # Wait for the real request before replying, just as the host does.
            page.wait_for_function('(path) => (window.__hostMessages || []).some(m => m.kind === "attachmentPreview" && m.path === path)', arg=path)
            emit({'kind': 'attachmentPreview', 'path': path, 'src': f'http://127.0.0.1:{PORT}/dev/bild-beispiel-1.jpg'})
        if paths:
            page.wait_for_function('Array.from(document.querySelectorAll(".attachment-row img")).every(i => i.complete && i.naturalWidth > 0)')
            expect(page.locator('.attachment-row.has-preview')).to_have_count(len(paths))
        expect(textarea).to_have_value(text)

    emit({'kind': 'modes', 'permissionMode': 'full', 'askPermission': False, 'routingMode': 'auto'})
    composer = page.locator('.composer')
    textarea = page.locator('.composer > textarea')
    close(composer.bounding_box()['height'], 98)
    close(composer.bounding_box()['width'], 736)
    empty = outline(composer.screenshot())
    page.locator('.cx-compose-area').screenshot(path=str(OUT / 'composer-corners-empty.png'))
    text_inset = textarea.evaluate('e => e.getBoundingClientRect().left + parseFloat(getComputedStyle(e).paddingLeft)')
    close(text_inset - composer.bounding_box()['x'], 12)
    plus = page.get_by_role('button', name='Hinzufügen', exact=True)
    close(plus.bounding_box()['x'] + 14 - composer.bounding_box()['x'], 22)

    prompt = 'Prüfe die Rundungen und die Abstände zum Text.\nDas Bild sitzt bündig mit dem Text innerhalb der Außenkante.\nAuch bei mehreren Zeilen bleiben die Ecken unverändert.'
    seed(['/demo/corner-reference.jpg'], prompt)
    page.mouse.move(0, 0)
    thumb = page.locator('.attachment-row.has-preview').first
    box, preview, text = composer.bounding_box(), thumb.bounding_box(), textarea.bounding_box()
    close(box['height'], 244)
    close(preview['x'] - box['x'], 12)
    close(preview['y'] - box['y'], 12)
    close(preview['width'], 122)
    close(preview['height'], 122)
    close(text['y'] - preview['y'] - preview['height'], 10)
    send = page.locator('.run-btn.send').bounding_box()
    close(box['x'] + box['width'] - send['x'] - send['width'], 8)
    close(box['y'] + box['height'] - send['y'] - send['height'], 8)
    attached = outline(composer.screenshot(path=str(OUT / 'composer-corners-image.png')))
    # The same fixed curve must survive growing from 98px to 244px.
    assert empty.crop((0, 0, 20, 60)).tobytes() == attached.crop((0, 0, 20, 60)).tobytes()
    # The actual image is clipped, not just the border drawn over square pixels.
    clipped = Image.open(BytesIO(thumb.screenshot())).convert('RGB')
    for x, y in ((2, 2), (241, 2), (2, 241), (241, 241)):
        assert clipped.getpixel((x, y)) == (53, 53, 53), (x, y, clipped.getpixel((x, y)))
    remove = thumb.get_by_role('button', name='Remove corner-reference.jpg')
    expect(remove).to_have_css('opacity', '0')
    remove.focus()
    expect(remove).to_have_css('opacity', '1')
    textarea.focus()

    # Menus outside the surface remain reachable; rounding must not clip them.
    plus.click()
    menu_item = page.get_by_role('menuitem', name='Vorlagen', exact=True)
    expect(menu_item).to_be_visible()
    assert page.locator('.add-popup').bounding_box()['y'] < composer.bounding_box()['y']
    assert page.locator('.add-popup [role="menuitem"]').first.evaluate('e => {const r = e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));}')
    menu_item.click()
    expect(page.locator('.cx-templates')).to_be_visible()
    page.get_by_role('button', name='Vorlagen schließen', exact=True).click()

    seed([f'/demo/corner-{n}.jpg' for n in range(7)], prompt)
    strip = page.locator('.attachment-strip')
    assert strip.evaluate('e => e.scrollWidth > e.clientWidth')
    close(strip.bounding_box()['height'], 122)
    for width in (960, 760, 560):
        page.set_viewport_size({'width': width, 'height': 900})
        textarea.fill('Bild und Text bleiben innerhalb der Ecken.\nMehrzeiliger Text mit sauberen Abständen.')
        assert page.locator('body').evaluate('e => e.scrollWidth <= innerWidth')
        close(thumb.bounding_box()['x'] - composer.bounding_box()['x'], 12)
        close(strip.bounding_box()['height'], 122)
        controls = page.locator('.composer-bar').bounding_box()
        box = composer.bounding_box()
        assert controls['x'] >= box['x'] + 8 and controls['x'] + controls['width'] <= box['x'] + box['width'] - 8
    page.locator('.cx-compose-area').screenshot(path=str(OUT / 'composer-corners-narrow.png'))
    # Reflow an unchanged draft both ways, including one that hits the height
    # cap. It must shrink again without requiring another keystroke.
    textarea.fill('Bild und Text brauchen passende Abstände. ' * 12)
    page.wait_for_function('document.querySelector(".composer > textarea").offsetHeight === 180')
    page.set_viewport_size({'width': 1440, 'height': 950})
    page.wait_for_function('document.querySelector(".composer > textarea").offsetHeight < 180')
    page.set_viewport_size({'width': 560, 'height': 900})
    page.wait_for_function('document.querySelector(".composer > textarea").offsetHeight === 180')
    strip.evaluate('e => e.scrollLeft = e.scrollWidth')
    page.get_by_role('button', name='Remove corner-6.jpg', exact=True).click()
    expect(page.locator('.attachment-row')).to_have_count(6)
    assert not errors, errors
    print('Composer geometry: reference silhouette, fixed growing corners, image clipping, text/image insets, keyboard removal, unclipped menus and narrow filmstrip passed.')
