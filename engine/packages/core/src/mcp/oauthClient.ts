/**
 * Ein OAuth-Client, den du selbst mitbringst — Client-ID und Client-Secret aus
 * der Konsole eines Anbieters, von Hand eingetragen oder als die JSON-Datei, die
 * Google zum Herunterladen anbietet.
 *
 * Nötig ist das überall dort, wo ein Anbieter keine Selbstregistrierung erlaubt:
 * Google (YouTube, Gmail, Kalender, Drive), HubSpot und jeder Remote-Server, der
 * eine vorab angelegte App verlangt.
 *
 * Rein rechnend, ohne `node:`-Module: dieselbe Prüfung läuft im Host und auf der
 * Seite, damit ein Fehler in der Datei dort steht, wo man sie ausgewählt hat.
 */

export interface OwnClient {
  clientId: string;
  clientSecret?: string;
  /** Aus der Datei, falls sie welche nennt — sonst gelten die des Anbieters. */
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  /** Google unterscheidet Desktop-App (`installed`) und Webanwendung (`web`). */
  kind: 'installed' | 'web' | 'plain';
  projectId?: string;
}

/**
 * Die feste Rückrufadresse für eigene Clients. Fest, weil manche Anbieter
 * (HubSpot) genau die eingetragene Adresse verlangen — mit wechselndem Port
 * ließe sie sich nie in ihrer Konsole hinterlegen. Google erlaubt für
 * Desktop-Apps jeden lokalen Port, dort muss nichts eingetragen werden.
 */
export const OWN_CLIENT_PORT = 38127;

/**
 * Welcher Name in der Adresse steht, entscheidet der Anbieter: HubSpot nimmt
 * ohne HTTPS nur `localhost`, Spotify nur `127.0.0.1`. Gelauscht wird in beiden
 * Fällen ausschließlich auf 127.0.0.1.
 */
export type RedirectHost = 'localhost' | '127.0.0.1';
export const ownClientRedirect = (host: RedirectHost = '127.0.0.1') =>
  `http://${host}:${OWN_CLIENT_PORT}/callback`;
export const OWN_CLIENT_REDIRECT = ownClientRedirect();

/** Endpunkte und Eigenheiten der Anbieter, deren Clients man selbst anlegt. */
export const OAUTH_PROVIDERS = {
  google: {
    label: 'Google',
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    // Ohne `offline` gibt Google keinen Refresh-Token aus, ohne `consent` beim
    // zweiten Anmelden auch nicht — dann liefe die Verbindung nach einer Stunde ab.
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
    console: 'https://console.cloud.google.com/apis/credentials',
  },
} as const;

export type OAuthProviderId = keyof typeof OAUTH_PROVIDERS;

const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const https = (v: unknown): string | undefined => {
  const value = text(v);
  return value && /^https:\/\//.test(value) ? value : undefined;
};

export type ClientParse = { ok: true; client: OwnClient } | { ok: false; error: string };

/** Liest eine hochgeladene Client-Datei. Die Fehlermeldungen sagen, was stattdessen gebraucht wird. */
export function parseClientJson(content: string): ClientParse {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return { ok: false, error: 'Die Datei ist kein gültiges JSON.' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Die Datei enthält kein JSON-Objekt.' };
  }
  const doc = raw as Record<string, unknown>;

  if (doc.type === 'service_account') {
    return {
      ok: false,
      error:
        'Das ist der Schlüssel eines Dienstkontos, kein OAuth-Client. Lege in der Google-Konsole unter „Anmeldedaten“ eine OAuth-Client-ID vom Typ „Desktop-App“ an und lade deren JSON herunter.',
    };
  }
  if (doc.type === 'authorized_user') {
    return {
      ok: false,
      error: 'Das ist ein gespeicherter Anmelde-Token, keine Client-Datei. Gebraucht wird die JSON der OAuth-Client-ID.',
    };
  }

  const nested = (['installed', 'web'] as const).find((key) => doc[key] && typeof doc[key] === 'object');
  const body = (nested ? doc[nested] : doc) as Record<string, unknown>;
  const clientId = text(body.client_id) ?? text(body.clientId);
  const clientSecret = text(body.client_secret) ?? text(body.clientSecret);
  if (!clientId) {
    return {
      ok: false,
      error: nested
        ? `Im Abschnitt „${nested}“ fehlt „client_id“.`
        : 'Keine „client_id“ gefunden. Erwartet wird die JSON einer OAuth-Client-ID, wie die Google-Konsole sie herunterlädt.',
    };
  }
  return {
    ok: true,
    client: {
      clientId,
      clientSecret,
      authorizationEndpoint: https(body.auth_uri) ?? https(body.authorization_endpoint),
      tokenEndpoint: https(body.token_uri) ?? https(body.token_endpoint),
      kind: nested ?? 'plain',
      projectId: text(body.project_id),
    },
  };
}

/** Aus zwei Feldern — dieselbe Prüfung, damit beide Wege dasselbe ablegen. */
export function clientFromFields(clientId: string, clientSecret: string): ClientParse {
  const id = clientId.trim();
  if (!id) return { ok: false, error: 'Die Client-ID fehlt.' };
  if (/\s/.test(id)) return { ok: false, error: 'Die Client-ID enthält Leerzeichen — vermutlich wurde zu viel kopiert.' };
  return { ok: true, client: { clientId: id, clientSecret: clientSecret.trim() || undefined, kind: 'plain' } };
}

/**
 * Die Client-Datei so, wie Googles Bibliotheken sie lesen (`installed`). Ein
 * Server bekommt immer dieses Format, egal ob die Werte aus einer Datei oder aus
 * zwei Feldern kamen.
 */
export function googleClientJson(client: OwnClient): string {
  const google = OAUTH_PROVIDERS.google;
  return `${JSON.stringify(
    {
      installed: {
        client_id: client.clientId,
        ...(client.projectId ? { project_id: client.projectId } : {}),
        auth_uri: client.authorizationEndpoint ?? 'https://accounts.google.com/o/oauth2/auth',
        token_uri: client.tokenEndpoint ?? google.tokenEndpoint,
        ...(client.clientSecret ? { client_secret: client.clientSecret } : {}),
        redirect_uris: ['http://localhost'],
      },
    },
    null,
    2,
  )}\n`;
}

/** Die Token-Datei im Format von `google-auth-library` — so lesen sie YouTube, Gmail und Kalender. */
export function googleTokenJson(tokens: {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  tokenType: string;
}): string {
  return `${JSON.stringify(
    {
      access_token: tokens.accessToken,
      ...(tokens.refreshToken ? { refresh_token: tokens.refreshToken } : {}),
      ...(tokens.scope ? { scope: tokens.scope } : {}),
      token_type: /^bearer$/i.test(tokens.tokenType) ? 'Bearer' : tokens.tokenType,
      ...(tokens.expiresAt ? { expiry_date: tokens.expiresAt } : {}),
    },
    null,
    2,
  )}\n`;
}

/** Für die Anzeige: genug, um den Client wiederzuerkennen, nicht genug, um ihn zu benutzen. */
export function maskClientId(clientId: string): string {
  const google = /^(\d+)-([a-z0-9]+)\.apps\.googleusercontent\.com$/.exec(clientId);
  if (google) return `${google[1]!.slice(0, 4)}…${google[2]!.slice(-4)}.apps.googleusercontent.com`;
  return clientId.length > 12 ? `${clientId.slice(0, 4)}…${clientId.slice(-4)}` : clientId;
}
