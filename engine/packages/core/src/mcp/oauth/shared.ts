/** Die Typen der MCP-Anmeldung, die alle Schritte teilen. */

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

export type Fetch = typeof fetch;
