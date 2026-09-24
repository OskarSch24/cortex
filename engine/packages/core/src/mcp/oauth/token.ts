import { createHash, randomBytes } from 'node:crypto';
import { OAUTH_FETCH_TIMEOUT_MS, OAUTH_TOKEN_TIMEOUT_MS } from '../../util/timeouts.js';
import { OAuthError, type Fetch, type OAuthClient, type OAuthEndpoints, type StoredOAuth, type TokenSet } from './shared.js';

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
    signal: AbortSignal.timeout(OAUTH_FETCH_TIMEOUT_MS),
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
    signal: AbortSignal.timeout(OAUTH_TOKEN_TIMEOUT_MS),
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
