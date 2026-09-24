import {
  buildAuthorizationUrl,
  createPkce,
  discoverOAuth,
  exchangeCode,
  listenForCallback,
  OAUTH_PROVIDERS,
  OAuthError,
  OWN_CLIENT_PORT,
  probeServer,
  randomState,
  registerClient,
  type ClientDelivery,
  type OAuthClient,
  type OAuthEndpoints,
  type OwnClient,
  type StoredOAuth,
} from '@cortex/core';

/**
 * Eine Anmeldung bei einem entfernten MCP-Server, von Klick bis Token.
 *
 * Der Browser geht nur auf, weil du „Anmelden“ oder „+“ gedrückt hast — das ist
 * die ausdrücklich gestartete Anmeldung, die AGENTS.md vom Verbot automatisch
 * geöffneter Fenster ausnimmt. Ohne diesen Klick öffnet nichts hier einen
 * Browser, auch nicht, wenn ein Token abläuft.
 */

export type LoginStep =
  | { step: 'suche'; message: string }
  | { step: 'browser'; message: string; url: string }
  | { step: 'tausche'; message: string };

interface LoginDeps {
  openExternal(url: string): Thenable<boolean> | Promise<boolean>;
  doFetch?: typeof fetch;
  onStep?: (step: LoginStep) => void;
  signal?: AbortSignal;
  /** Wie lange der Browser Zeit hat. */
  timeoutMs?: number;
}

export async function loginToServer(url: string, deps: LoginDeps): Promise<StoredOAuth> {
  const endpoints = await remoteEndpoints(url, deps);
  const state = randomState();
  const listener = await listenForCallback(state, { timeoutMs: deps.timeoutMs, signal: deps.signal });
  try {
    const client = await registerClient(endpoints, listener.redirectUri, deps.doFetch ?? fetch);
    return await authorize(endpoints, client, state, listener, deps);
  } finally {
    listener.close();
  }
}

/**
 * Anmelden mit einem Client, den du selbst angelegt hast. Die Endpunkte kommen
 * vom Anbieter (`google`) oder aus den Metadaten des Remote-Servers; registriert
 * wird nichts. Die Rückrufadresse ist fest, damit sie sich in der Konsole des
 * Anbieters eintragen lässt.
 */
export async function loginWithOwnClient(
  target: { url?: string; client: OwnClient; delivery?: ClientDelivery },
  deps: LoginDeps & { port?: number },
): Promise<StoredOAuth> {
  const provider = target.delivery?.provider ? OAUTH_PROVIDERS[target.delivery.provider] : undefined;
  let endpoints: OAuthEndpoints;
  if (target.url) {
    endpoints = await remoteEndpoints(target.url, deps);
  } else if (provider) {
    endpoints = {
      issuer: provider.authorizationEndpoint,
      authorizationEndpoint: provider.authorizationEndpoint,
      tokenEndpoint: target.client.tokenEndpoint ?? provider.tokenEndpoint,
    };
  } else {
    throw new OAuthError('Für diesen Eintrag ist weder ein Anbieter noch eine Serveradresse bekannt.', 'no_provider');
  }
  if (provider) endpoints = { ...endpoints, extraAuthParams: { ...provider.extraAuthParams } };
  const scopes = target.delivery?.scopes;
  if (scopes?.length) endpoints = { ...endpoints, scope: scopes.join(' ') };

  deps.onStep?.({ step: 'suche', message: 'Anmeldung mit deinem OAuth-Client wird vorbereitet …' });
  const state = randomState();
  const listener = await listenForCallback(state, {
    timeoutMs: deps.timeoutMs,
    signal: deps.signal,
    port: deps.port ?? OWN_CLIENT_PORT,
    redirectHost: target.delivery?.redirectHost,
  });
  try {
    const client: OAuthClient = {
      clientId: target.client.clientId,
      clientSecret: target.client.clientSecret,
      authMethod: target.client.clientSecret ? 'client_secret_post' : 'none',
      redirectUri: listener.redirectUri,
    };
    return await authorize(endpoints, client, state, listener, deps);
  } catch (error) {
    // Die häufigsten Fehler bei eigenen Clients haben eine klare Ursache in der Konsole.
    if (error instanceof OAuthError && error.code === 'invalid_client') {
      throw new OAuthError('Der Anbieter kennt diese Client-ID oder dieses Secret nicht. Prüfe beides in der Konsole.', 'invalid_client');
    }
    if (error instanceof OAuthError && error.code === 'redirect_uri_mismatch') {
      throw new OAuthError(`Die Rückrufadresse ${listener.redirectUri} ist beim Anbieter nicht eingetragen.`, 'redirect_uri_mismatch');
    }
    throw error;
  } finally {
    listener.close();
  }
}

async function remoteEndpoints(url: string, deps: LoginDeps): Promise<OAuthEndpoints> {
  const doFetch = deps.doFetch ?? fetch;
  deps.onStep?.({ step: 'suche', message: 'Anmeldeverfahren des Anbieters wird gesucht …' });

  // Die 401 des Servers nennt, wo seine Metadaten liegen — das ist verlässlicher
  // als jede Vermutung über Pfade.
  const probe = await probeServer({ url }, { timeoutMs: 15_000, fetch: doFetch, signal: deps.signal });
  if (probe.ok) {
    throw new OAuthError('Dieser Server verlangt keine Anmeldung — er ist ohne verbunden.', 'not_required');
  }
  if (probe.reason !== 'auth') {
    throw new OAuthError(`${probe.message}${probe.detail ? ` (${probe.detail})` : ''}`, 'unreachable');
  }

  return discoverOAuth(url, probe.wwwAuthenticate, doFetch);
}

async function authorize(
  endpoints: OAuthEndpoints,
  client: OAuthClient,
  state: string,
  listener: Awaited<ReturnType<typeof listenForCallback>>,
  deps: LoginDeps,
): Promise<StoredOAuth> {
  const doFetch = deps.doFetch ?? fetch;
  const pkce = createPkce();
  const authorizeUrl = buildAuthorizationUrl(endpoints, client, pkce, state);

  deps.onStep?.({
    step: 'browser',
    message: `Anmeldung bei ${new URL(endpoints.authorizationEndpoint).host} im Browser …`,
    url: authorizeUrl,
  });
  const opened = await deps.openExternal(authorizeUrl);
  if (!opened) throw new OAuthError('Der Browser ließ sich nicht öffnen.', 'browser');

  const code = await listener.code;
  deps.onStep?.({ step: 'tausche', message: 'Anmeldung wird abgeschlossen …' });
  const tokens = await exchangeCode(endpoints, client, code, pkce.verifier, doFetch);
  return { endpoints, client, tokens, connectedAt: Date.now() };
}
