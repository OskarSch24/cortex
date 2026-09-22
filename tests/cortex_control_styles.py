"""Visual guard for shared Cortex controls used outside the Settings page."""

def assert_controls_styled(page):
    sheets = page.evaluate('''() => [...document.styleSheets].filter(sheet =>
      sheet.href?.endsWith('/settings.css') && !sheet.disabled).map(sheet => { try { return sheet.cssRules.length; } catch { return 0; } })''')
    assert sheets and all(count > 100 for count in sheets), 'Shared control stylesheet did not load'
    primary = page.locator('.cx-teams-header .cxs-button.primary').first
    values = primary.evaluate('''button => {
      const css = getComputedStyle(button);
      return {radius: css.borderRadius, background: css.backgroundColor,
        color: css.color, padding: css.paddingLeft, gap: css.gap};
    }''')
    assert values['radius'] == '8px', values
    assert values['background'] in ('rgb(241, 241, 241)', 'rgb(255, 255, 255)'), values
    assert values['color'] == 'rgb(19, 20, 22)', values
    assert values['padding'] == '10px' and values['gap'] == '6px', values
    for button in page.locator('.cx-teams .cxs-select-button:not(:disabled)').all():
        values = button.evaluate('''button => {
          const css = getComputedStyle(button);
          return {radius: css.borderRadius, color: css.color,
            expectedColor: css.getPropertyValue('--cx-text').trim(),
            background: css.backgroundColor, padding: css.paddingLeft,
            control: css.getPropertyValue('--cxs-control').trim(),
            controlLine: css.getPropertyValue('--cxs-control-line').trim()};
        }''')
        assert values['radius'] == '8px', values
        assert values['color'] == 'rgb(237, 237, 238)', values
        assert values['padding'] in ('10px', '11px'), values
        assert values['background'] not in ('rgb(239, 239, 239)', 'rgb(255, 255, 255)', 'rgba(0, 0, 0, 0)'), values
        assert values['control'] and values['controlLine'], values
