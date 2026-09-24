import { isRecord, nonEmptyString } from '../../util/guards.js';
import { OAUTH_FETCH_TIMEOUT_MS } from '../../util/timeouts.js';
import { MCP_PROTOCOL_VERSION } from '../transport.js';
import { OAuthError, type Fetch, type OAuthEndpoints } from './shared.js';

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
      headers: { accept: 'application/json', 'mcp-protocol-version': MCP_PROTOCOL_VERSION },
      signal: AbortSignal.timeout(OAUTH_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return undefined;
    }
    const parsed = (await response.json()) as unknown;
    return isRecord(parsed) ? parsed : undefined;
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

  const scopes = Array.isArray(protectedResource?.scopes_supported)
    ? (protectedResource!.scopes_supported as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];
  const scope = authParam(wwwAuthenticate, 'scope') ?? (scopes.length ? scopes.join(' ') : undefined);
  const resourceId = nonEmptyString(protectedResource?.resource) ?? resourceUrl;

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
    issuer: nonEmptyString(metadata.issuer) ?? issuer,
    authorizationEndpoint: metadata.authorization_endpoint as string,
    tokenEndpoint: metadata.token_endpoint as string,
    registrationEndpoint: nonEmptyString(metadata.registration_endpoint),
    scope,
    codeChallengeMethods: Array.isArray(metadata.code_challenge_methods_supported)
      ? (metadata.code_challenge_methods_supported as unknown[]).filter((m): m is string => typeof m === 'string')
      : undefined,
  };
}
