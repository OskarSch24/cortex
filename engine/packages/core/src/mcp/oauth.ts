import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

/**
 * Die Anmeldung bei einem entfernten MCP-Server, so wie die MCP-Spezifikation
 * sie beschreibt — und nicht wie ein einzelner Anbieter sie gebaut hat:
 *
 *   1. Der Server antwortet 401 und nennt in `WWW-Authenticate` seine
 *      Metadaten (RFC 9728). Nennt er sie nicht, gibt es sie unter
 *      `/.well-known/oauth-protected-resource`.
 *   2. Die Metadaten nennen den Autorisierungsserver; dessen eigene Metadaten
 *      (RFC 8414 oder OpenID Discovery) nennen die Endpunkte.
 *   3. Cortex registriert sich dort selbst (RFC 7591) — ohne vorher angelegte
 *      App, ohne Client-Secret.
 *   4. Autorisierungscode mit PKCE (S256) über eine Rückrufadresse auf
 *      127.0.0.1, `resource` nach RFC 8707, damit der Token nur für genau
 *      diesen Server gilt.
 *
 * Alles hier ist ohne VS Code lauffähig und prüfbar. Wo die Tokens liegen und
 * wann der Browser aufgeht, entscheidet der Host.
 */

export interface OAuthEndpoints {
  /**
   * Die Adresse des MCP-Servers, für die der Token gelten soll (RFC 8707).
   * Fehlt bei Anbietern wie Google, deren Token nicht an einen MCP-Server
   * gebunden wird — dort würde der Parameter die Anmeldung abweisen.
   */
  resource?: string;
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint?: string;
  /** Was der Server als Berechtigung verlangt — aus `WWW-Authenticate` oder den Metadaten. */
  scope?: string;
  codeChallengeMethods?: string[];
  /** Was ein Anbieter zusätzlich braucht, etwa Googles `access_type=offline`. */
  extraAuthParams?: Record<string, string>;
}

export interface OAuthClient {
  clientId: string;
  clientSecret?: string;
  /** Wie der Client sich am Token-Endpunkt ausweist. */
  authMethod: 'none' | 'client_secret_post' | 'client_secret_basic';
  redirectUri: string;
}

export interface TokenSet {
  accessToken: string;
  tokenType: string;
  refreshToken?: string;
  /** Millisekunden seit 1970 — fehlt, wenn der Server keine Laufzeit nennt. */
  expiresAt?: number;
  scope?: string;
}

/** Was der Host braucht, um den Token später aufzufrischen. */
export interface StoredOAuth {
  endpoints: OAuthEndpoints;
  client: OAuthClient;
  tokens: TokenSet;
  /** Wann angemeldet wurde, für die Anzeige. */
  connectedAt: number;
}

export class OAuthError extends Error {
  constructor(
    message: string,
    /** `invalid_grant` beim Auffrischen heißt: neu anmelden, nicht wiederholen. */
    readonly code?: string,
  ) {
    super(message);
    this.name = 'OAuthError';
  }
}

type Fetch = typeof fetch;

// ---------------------------------------------------------------------------
// Entdecken

/** Liest `key="wert"` oder `key=wert` aus einem `WWW-Authenticate`-Kopf. */
export function authParam(header: string | undefined, key: string): string | undefined {
  if (!header) return undefined;
  const match = new RegExp(`(?:^|[\\s,])${key}=(?:"([^"]*)"|([^\\s,]+))`, 'i').exec(header);
  return match ? (match[1] ?? match[2]) : undefined;
}

async function getJson(doFetch: Fetch, url: string): Promise<Record<string, unknown> | undefined> {
  try {
    const response = await doFetch(url, {
      headers: { accept: 'application/json', 'mcp-protocol-version': '2025-06-18' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return undefined;
    }
    const parsed = (await response.json()) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Die Pfadvarianten, unter denen RFC 8414/9728 Metadaten erlauben. */
function wellKnown(base: string, name: string): string[] {
  const url = new URL(base);
  const path = url.pathname.replace(/\/$/, '');
  return path && path !== '/'
    ? [`${url.origin}/.well-known/${name}${path}`, `${url.origin}/.well-known/${name}`]
    : [`${url.origin}/.well-known/${name}`];
}

export async function discoverOAuth(
  resourceUrl: string,
  wwwAuthenticate: string | undefined,
  doFetch: Fetch = fetch,
): Promise<OAuthEndpoints> {
  const resource = new URL(resourceUrl);

  // 1. Die geschützte Ressource.
  const named = authParam(wwwAuthenticate, 'resource_metadata');
  let protectedResource: Record<string, unknown> | undefined;
  for (const candidate of named ? [named] : wellKnown(resourceUrl, 'oauth-protected-resource')) {
    protectedResource = await getJson(doFetch, candidate);
    if (protectedResource) break;
  }
  const servers = Array.isArray(protectedResource?.authorization_servers)
    ? (protectedResource!.authorization_servers as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];
  // Ältere Server (Spezifikation 2025-03-26) haben keine Ressourcen-Metadaten:
  // dort ist der MCP-Server selbst der Autorisierungsserver.
  const issuer = servers[0] ?? resource.origin;

  // 2. Der Autorisierungsserver.
  const issuerUrl = new URL(issuer);
  const issuerPath = issuerUrl.pathname.replace(/\/$/, '');
  const candidates =
    issuerPath && issuerPath !== '/'
      ? [
          `${issuerUrl.origin}/.well-known/oauth-authorization-server${issuerPath}`,
          `${issuerUrl.origin}/.well-known/openid-configuration${issuerPath}`,
          `${issuerUrl.origin}${issuerPath}/.well-known/openid-configuration`,
          `${issuerUrl.origin}/.well-known/oauth-authorization-server`,
        ]
      : [
          `${issuerUrl.origin}/.well-known/oauth-authorization-server`,
          `${issuerUrl.origin}/.well-known/openid-configuration`,
        ];
  let metadata: Record<string, unknown> | undefined;
  for (const candidate of candidates) {
    const found = await getJson(doFetch, candidate);
    if (typeof found?.authorization_endpoint === 'string' && typeof found?.token_endpoint === 'string') {
      metadata = found;
      break;
    }
  }

  const text = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  const scopes = Array.isArray(protectedResource?.scopes_supported)
    ? (protectedResource!.scopes_supported as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];
  const scope = authParam(wwwAuthenticate, 'scope') ?? (scopes.length ? scopes.join(' ') : undefined);
  const resourceId = text(protectedResource?.resource) ?? resourceUrl;

  if (!metadata) {
    if (servers.length) {
      throw new OAuthError(`Der Autorisierungsserver ${issuer} veröffentlicht keine Metadaten.`);
    }
    // Rückfall der Spezifikation 2025-03-26: feste Pfade am Ursprung.
    return {
      resource: resourceId,
      issuer,
      authorizationEndpoint: `${resource.origin}/authorize`,
      tokenEndpoint: `${resource.origin}/token`,
      registrationEndpoint: `${resource.origin}/register`,
      scope,
    };
  }

  return {
    resource: resourceId,
    issuer: text(metadata.issuer) ?? issuer,
    authorizationEndpoint: metadata.authorization_endpoint as string,
    tokenEndpoint: metadata.token_endpoint as string,
    registrationEndpoint: text(metadata.registration_endpoint),
    scope,
    codeChallengeMethods: Array.isArray(metadata.code_challenge_methods_supported)
      ? (metadata.code_challenge_methods_supported as unknown[]).filter((m): m is string => typeof m === 'string')
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Registrieren

export async function registerClient(
  endpoints: OAuthEndpoints,
  redirectUri: string,
  doFetch: Fetch = fetch,
): Promise<OAuthClient> {
  if (!endpoints.registrationEndpoint) {
    throw new OAuthError(
      'Dieser Anbieter erlaubt keine automatische Registrierung. Er verlangt eine vorher angelegte App mit eigenem Client — das kann Cortex nicht für dich erledigen.',
      'registration_unsupported',
    );
  }
  const response = await doFetch(endpoints.registrationEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      client_name: 'Cortex',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      ...(endpoints.scope ? { scope: endpoints.scope } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (response.status === 401 || response.status === 403) {
    // Der Endpunkt steht in den Metadaten, nimmt aber nur Programme an, die der
    // Anbieter selbst freigegeben hat (Figma). Ein neuer Versuch ändert daran
    // nichts, und ein eigener Client auch nicht.
    throw new OAuthError(
      `${new URL(endpoints.registrationEndpoint).host} nimmt nur Programme an, die der Anbieter freigegeben hat — Cortex gehört nicht dazu.`,
      'registration_forbidden',
    );
  }
  if (!response.ok || typeof body.client_id !== 'string') {
    throw new OAuthError(
      `Die Registrierung bei ${new URL(endpoints.registrationEndpoint).host} ist gescheitert (HTTP ${response.status}).`,
      typeof body.error === 'string' ? body.error : undefined,
    );
  }
  const secret = typeof body.client_secret === 'string' && body.client_secret ? body.client_secret : undefined;
  const method = body.token_endpoint_auth_method;
  return {
    clientId: body.client_id,
    clientSecret: secret,
    authMethod:
      method === 'client_secret_basic' || method === 'client_secret_post'
        ? method
        : secret
          ? 'client_secret_post'
          : 'none',
    redirectUri,
  };
}

// ---------------------------------------------------------------------------
// Autorisieren

export interface Pkce {
  verifier: string;
  challenge: string;
}

export function createPkce(): Pkce {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function randomState(): string {
  return randomBytes(24).toString('base64url');
}

export function buildAuthorizationUrl(
  endpoints: OAuthEndpoints,
  client: OAuthClient,
  pkce: Pkce,
  state: string,
): string {
  if (endpoints.codeChallengeMethods && !endpoints.codeChallengeMethods.includes('S256')) {
    // Ohne S256 wäre der Code auf dem Weg durch den Browser ungeschützt.
    throw new OAuthError('Der Anbieter unterstützt kein PKCE mit S256 — Cortex meldet sich dort nicht an.');
  }
  const params: Record<string, string> = {
    response_type: 'code',
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
    state,
    ...(endpoints.resource ? { resource: endpoints.resource } : {}),
    ...(endpoints.scope ? { scope: endpoints.scope } : {}),
    ...(endpoints.extraAuthParams ?? {}),
  };
  const url = new URL(endpoints.authorizationEndpoint);
  // Von Hand statt über URLSearchParams: das schreibt Leerzeichen als „+“, und
  // VS Code macht beim Öffnen daraus ein „%2B“ — aus `scope=a b` würde `a+b`.
  const own = url.search.replace(/^\?/, '');
  const added = Object.entries(params)
    .filter(([key]) => !url.searchParams.has(key))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  url.search = '';
  return `${url.href}?${own ? `${own}&` : ''}${added}`;
}

async function tokenRequest(
  endpoints: Pick<OAuthEndpoints, 'tokenEndpoint' | 'resource'>,
  client: OAuthClient,
  params: Record<string, string>,
  doFetch: Fetch,
): Promise<TokenSet> {
  const form = new URLSearchParams({ ...params, ...(endpoints.resource ? { resource: endpoints.resource } : {}) });
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json',
  };
  if (client.authMethod === 'client_secret_basic' && client.clientSecret) {
    const pair = `${encodeURIComponent(client.clientId)}:${encodeURIComponent(client.clientSecret)}`;
    headers.authorization = `Basic ${Buffer.from(pair).toString('base64')}`;
  } else {
    form.set('client_id', client.clientId);
    if (client.authMethod === 'client_secret_post' && client.clientSecret) {
      form.set('client_secret', client.clientSecret);
    }
  }
  const response = await doFetch(endpoints.tokenEndpoint, {
    method: 'POST',
    headers,
    body: form.toString(),
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Manche Server antworten formularkodiert.
    body = Object.fromEntries(new URLSearchParams(raw));
  }
  if (!response.ok || typeof body.access_token !== 'string') {
    const code = typeof body.error === 'string' ? body.error : undefined;
    const description = typeof body.error_description === 'string' ? `: ${body.error_description}` : '';
    throw new OAuthError(`Der Token-Endpunkt hat abgelehnt (HTTP ${response.status}${code ? `, ${code}` : ''})${description}`, code);
  }
  const expiresIn = Number(body.expires_in);
  return {
    accessToken: body.access_token,
    tokenType: typeof body.token_type === 'string' ? body.token_type : 'Bearer',
    refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : undefined,
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? Date.now() + expiresIn * 1000 : undefined,
    scope: typeof body.scope === 'string' ? body.scope : undefined,
  };
}

export function exchangeCode(
  endpoints: OAuthEndpoints,
  client: OAuthClient,
  code: string,
  verifier: string,
  doFetch: Fetch = fetch,
): Promise<TokenSet> {
  return tokenRequest(
    endpoints,
    client,
    { grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: client.redirectUri },
    doFetch,
  );
}

/**
 * Frischt auf. Schickt der Server keinen neuen Refresh-Token, gilt der alte
 * weiter — so will es RFC 6749 §6.
 */
export async function refreshTokens(stored: StoredOAuth, doFetch: Fetch = fetch): Promise<TokenSet> {
  if (!stored.tokens.refreshToken) {
    throw new OAuthError('Der Anbieter hat keinen Refresh-Token ausgegeben — bitte neu anmelden.', 'invalid_grant');
  }
  const fresh = await tokenRequest(
    stored.endpoints,
    stored.client,
    { grant_type: 'refresh_token', refresh_token: stored.tokens.refreshToken },
    doFetch,
  );
  return { ...fresh, refreshToken: fresh.refreshToken ?? stored.tokens.refreshToken };
}

/** Ob ein Token innerhalb des Fensters abläuft. Ohne Laufzeit: nie. */
export function expiresWithin(tokens: TokenSet, ms: number, now = Date.now()): boolean {
  return tokens.expiresAt !== undefined && tokens.expiresAt - now <= ms;
}

export function authorizationHeader(tokens: TokenSet): string {
  // `bearer` klein geschrieben lehnen manche Server ab — RFC 6750 schreibt „Bearer“.
  const type = /^bearer$/i.test(tokens.tokenType) ? 'Bearer' : tokens.tokenType;
  return `${type} ${tokens.accessToken}`;
}

// ---------------------------------------------------------------------------
// Rückruf

export interface CallbackListener {
  redirectUri: string;
  /** Erfüllt sich mit dem Code, sobald der Browser mit dem richtigen `state` zurückkommt. */
  code: Promise<string>;
  close(): void;
}

/**
 * Ein kurzlebiger Empfänger auf 127.0.0.1 — nie auf allen Schnittstellen. Er
 * nimmt genau einen Rückruf mit dem erwarteten `state` an und schließt sich.
 */
export async function listenForCallback(
  state: string,
  /** `port`: fest statt frei — für eigene Clients, deren Rückrufadresse beim Anbieter eingetragen ist. */
  options: { timeoutMs?: number; signal?: AbortSignal; port?: number; redirectHost?: 'localhost' | '127.0.0.1' } = {},
): Promise<CallbackListener> {
  let resolveCode!: (code: string) => void;
  let rejectCode!: (error: Error) => void;
  const code = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  // Wer den Code nicht abholt, soll keinen unbehandelten Fehler bekommen.
  code.catch(() => {});

  let server: Server | undefined;
  let timer: NodeJS.Timeout | undefined;
  const close = () => {
    if (timer) clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
    server?.close();
    server?.closeAllConnections?.();
  };
  const onAbort = () => {
    rejectCode(new OAuthError('Anmeldung abgebrochen.', 'cancelled'));
    close();
  };

  const handle = (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== '/callback') {
      response.writeHead(404).end();
      return;
    }
    const page = (title: string, text: string) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      response.end(
        `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
          `<body style="font:15px -apple-system,system-ui,sans-serif;background:#1e1e1e;color:#ddd;display:grid;place-items:center;height:100vh;margin:0">` +
          `<div style="text-align:center"><h1 style="font-size:18px;font-weight:600">${title}</h1><p style="color:#999">${text}</p></div>`,
      );
    };
    if (url.searchParams.get('state') !== state) {
      // Ein fremder Rückruf ändert nichts — der richtige kann noch kommen.
      page('Unbekannte Anmeldung', 'Diese Rückmeldung gehört zu keiner laufenden Anmeldung in Cortex.');
      return;
    }
    const error = url.searchParams.get('error');
    const received = url.searchParams.get('code');
    if (error || !received) {
      const description = url.searchParams.get('error_description');
      page('Anmeldung nicht abgeschlossen', 'Du kannst dieses Fenster schließen und es in Cortex erneut versuchen.');
      rejectCode(
        new OAuthError(
          error === 'access_denied'
            ? 'Die Anmeldung wurde beim Anbieter abgelehnt.'
            : `Der Anbieter hat die Anmeldung abgebrochen${description ? `: ${description}` : '.'}`,
          error ?? undefined,
        ),
      );
    } else {
      page('Verbunden', 'Du kannst dieses Fenster schließen und zu Cortex zurückkehren.');
      resolveCode(received);
    }
    setTimeout(close, 200).unref();
  };

  server = createServer(handle);
  await new Promise<void>((resolve, reject) => {
    server!.once('error', (error: NodeJS.ErrnoException) =>
      reject(
        error.code === 'EADDRINUSE'
          ? new OAuthError(
              `Port ${options.port} ist belegt — vermutlich läuft schon eine Anmeldung. Schließe sie oder warte, bis sie abläuft.`,
              'port_in_use',
            )
          : error,
      ),
    );
    server!.listen(options.port ?? 0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  timer = setTimeout(() => {
    rejectCode(new OAuthError('Die Anmeldung wurde nicht rechtzeitig abgeschlossen.', 'timeout'));
    close();
  }, options.timeoutMs ?? 5 * 60_000);
  timer.unref();
  options.signal?.addEventListener('abort', onAbort, { once: true });
  if (options.signal?.aborted) onAbort();

  return { redirectUri: `http://${options.redirectHost ?? '127.0.0.1'}:${port}/callback`, code, close };
}
