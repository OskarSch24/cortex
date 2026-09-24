"""Die Agentenseite trennt Übersicht und Profil (Entwurf nach Codex, 21.09.2026).

Anlegen und die Listen „Agenten“/„Teams“ gibt es nur in der Übersicht; aus
einem geöffneten Profil führt „Zur Übersicht“ dorthin zurück, ohne den Entwurf
zu verwerfen."""


def to_overview(page):
    back = page.get_by_role('button', name='Zur Übersicht', exact=True)
    if back.count():
        back.click()
