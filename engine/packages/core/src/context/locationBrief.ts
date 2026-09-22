/**
 * Wo der Nutzer ist — gesagt, nicht geraten.
 *
 * Beobachtet am 13.09.2026: Auf „Wie wird das Wetter heute?“ ermittelte Claude
 * den Ort über die IP-Adresse und landete in München statt in Frankfurt. Eine
 * IP-Adresse zeigt auf den Knoten des Anbieters oder eines VPN, nicht auf
 * einen Menschen. Deshalb bekommt jeder Anbieter den eingestellten Heimatort
 * und die ausdrückliche Anweisung, nicht per IP zu suchen.
 */
export function locationBrief(home: string | undefined): string {
  const place = home?.trim();
  if (place) {
    return (
      `The user is based in ${place}. For anything local — weather, departures, routes, opening hours, local time — ` +
      `use ${place} unless the user names another place in this conversation. Never determine the location from the IP address.`
    );
  }
  return (
    'You do not know where the user is. Never determine it from the IP address — that points at a provider or VPN node, not at the user. ' +
    'For anything local, use a place the user named, or ask once which place they mean.'
  );
}
