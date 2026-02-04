import http from "node:http";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import open from "open";
import { consola } from "consola";
import { handleCancel } from "./utils.ts";
import { spinner } from "@clack/prompts";

const TOKEN_FILE = path.join(os.homedir(), ".spaceflows", "cli-token.json");

// Environment variable names for API key authentication
const ENV_API_KEY = "FLOWCTL_API_KEY";
const ENV_BASE_URL = "FLOWCTL_BASE_URL";

/**
 * Check if API key authentication is configured via environment variables.
 * Returns the API key and base URL if FLOWCTL_API_KEY is set.
 * Throws an error if FLOWCTL_API_KEY is set but FLOWCTL_BASE_URL is not.
 */
function getEnvAuth(): { apiKey: string; baseUrl: string } | null {
  const apiKey = process.env[ENV_API_KEY];
  const baseUrl = process.env[ENV_BASE_URL];

  if (apiKey) {
    if (!baseUrl) {
      throw new Error(
        `${ENV_BASE_URL} must be set when using ${ENV_API_KEY}`,
      );
    }
    return { apiKey, baseUrl: baseUrl.replace(/\/$/, "") };
  }

  return null;
}

/**
 * Check if the CLI is using environment variable-based API key authentication.
 * Useful for commands that may want to skip interactive prompts.
 */
export function isUsingEnvAuth(): boolean {
  return !!process.env[ENV_API_KEY];
}

interface StoredToken {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  client_id: string;
  base_url: string;
  token_endpoint: string; // Store discovered endpoint for refresh operations
}

async function ensureConfigDir() {
  const dir = path.dirname(TOKEN_FILE);
  await fs.mkdir(dir, { recursive: true });
}

export async function loadToken(): Promise<StoredToken | null> {
  try {
    const raw = await fs.readFile(TOKEN_FILE, "utf8");
    return JSON.parse(raw) as StoredToken;
  } catch {
    return null;
  }
}

export async function saveToken(token: StoredToken) {
  await ensureConfigDir();
  await fs.writeFile(TOKEN_FILE, JSON.stringify(token, null, 2), "utf8");
}

function base64UrlEncode(buffer: Buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sha256(data: string) {
  return crypto.createHash("sha256").update(data).digest();
}

function generateRandomString(bytes = 32) {
  return base64UrlEncode(crypto.randomBytes(bytes));
}

export async function login(baseUrl: string): Promise<StoredToken> {
  const BASE_URL = baseUrl.replace(/\/$/, "");

  // Discover OAuth2 endpoints
  consola.debug("Discovering OAuth2 endpoints...");

  // Step 1: Get protected resource metadata
  const protectedResourceRes = await fetch(
    `${BASE_URL}/.well-known/oauth-protected-resource`,
  );
  if (!protectedResourceRes.ok) {
    throw new Error(
      `Failed to fetch protected resource metadata: ${protectedResourceRes.status} ${await protectedResourceRes.text()}`,
    );
  }

  const protectedResourceData = await protectedResourceRes.json();
  const authorizationServers =
    protectedResourceData.authorization_servers as string[];
  if (!authorizationServers || authorizationServers.length === 0) {
    throw new Error(
      "No authorization servers found in protected resource metadata",
    );
  }

  const authServerUrl = authorizationServers[0];
  consola.debug(`Using authorization server: ${authServerUrl}`);

  // Step 2: Get authorization server metadata
  const authServerMetadataRes = await fetch(
    `${authServerUrl}/.well-known/oauth-authorization-server`,
  );
  if (!authServerMetadataRes.ok) {
    throw new Error(
      `Failed to fetch authorization server metadata: ${authServerMetadataRes.status} ${await authServerMetadataRes.text()}`,
    );
  }

  const authServerMetadata = await authServerMetadataRes.json();
  const authorizationEndpoint =
    authServerMetadata.authorization_endpoint as string;
  const tokenEndpoint = authServerMetadata.token_endpoint as string;
  const registrationEndpoint =
    authServerMetadata.registration_endpoint as string;

  if (!authorizationEndpoint || !tokenEndpoint || !registrationEndpoint) {
    throw new Error(
      "Missing required endpoints in authorization server metadata",
    );
  }

  consola.debug(`Authorization endpoint: ${authorizationEndpoint}`);
  consola.debug(`Token endpoint: ${tokenEndpoint}`);
  consola.debug(`Registration endpoint: ${registrationEndpoint}`);

  const { port, codePromise } = await new Promise<{
    port: number;
    codePromise: Promise<URLSearchParams>;
  }>((resolve) => {
    const server = http.createServer();

    let codeParamsResolver: (params: URLSearchParams) => void;
    const codePromiseInner = new Promise<URLSearchParams>((r) => {
      codeParamsResolver = r;
    });

    let listeningPort: number;

    server.on("request", (req, res) => {
      if (!req.url) return;
      const u = new URL(req.url, `http://localhost:${listeningPort}`);
      if (u.pathname !== "/callback") {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        `<html><body><h1>Authentication successful</h1>You can close this window and return to the terminal.</body></html>`,
      );
      codeParamsResolver(u.searchParams);
      server.close();
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as any;
      listeningPort = addr.port;
      resolve({ port: listeningPort, codePromise: codePromiseInner });
    });
  });

  const redirectUri = `http://127.0.0.1:${port}/callback`;
  consola.debug(`Redirect URI set to ${redirectUri}`);

  const registerBody = {
    client_name: "Spaceflows CLI",
    redirect_uris: [redirectUri],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: "api apps:admin apps:view flows:edit",
    token_endpoint_auth_method: "none",
  };

  const regRes = await fetch(registrationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(registerBody),
  });

  if (!regRes.ok) {
    throw new Error(
      `Failed to register OAuth client: ${regRes.status} ${await regRes.text()}`,
    );
  }

  const regData = await regRes.json();
  const clientId = regData.client_id as string;
  consola.debug(`Obtained client_id ${clientId}`);

  const codeVerifier = generateRandomString(64);
  const codeChallenge = base64UrlEncode(sha256(codeVerifier));

  const state = generateRandomString(32);

  const authorizeUrl = new URL(authorizationEndpoint);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "api apps:admin apps:view flows:edit");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  const s = spinner();
  s.start("Opening browser and waiting for authentication…");
  await open(authorizeUrl.toString());

  const params = await codePromise;

  if (params.get("state") !== state) {
    throw new Error("State mismatch during OAuth callback, aborting.");
  }
  if (params.get("error")) {
    throw new Error(
      `OAuth error: ${params.get("error_description") ?? params.get("error")}`,
    );
  }

  const code = params.get("code");
  if (!code) {
    throw new Error("No authorization code received");
  }

  const tokenRes = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    }).toString(),
  });

  if (!tokenRes.ok) {
    throw new Error(
      `Failed to exchange authorization code: ${tokenRes.status} ${await tokenRes.text()}`,
    );
  }

  const tokenData = await tokenRes.json();

  const expiresAt = Date.now() + tokenData.expires_in * 1000;

  const stored: StoredToken = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token ?? undefined,
    expires_at: expiresAt,
    client_id: clientId,
    base_url: BASE_URL,
    token_endpoint: tokenEndpoint,
  };

  await saveToken(stored);
  s.stop("Authentication successful!");

  return stored;
}

async function refreshToken(token: StoredToken): Promise<StoredToken> {
  if (!token.refresh_token) throw new Error("No refresh token available");

  // If we don't have the token endpoint stored, we need to discover it again
  let tokenEndpoint = token.token_endpoint;

  const res = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
      client_id: token.client_id,
    }).toString(),
  });

  if (!res.ok) {
    throw new Error(
      `Failed to refresh access token: ${res.status} ${await res.text()}`,
    );
  }

  const data = await res.json();
  const newToken: StoredToken = {
    ...token,
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
    refresh_token: data.refresh_token ?? token.refresh_token,
    token_endpoint: tokenEndpoint,
  };

  await saveToken(newToken);
  return newToken;
}

export async function getValidToken(): Promise<string> {
  let token = await loadToken();
  if (!token) {
    handleCancel("No stored token found");
  }

  if (Date.now() > token.expires_at - 60 * 1000) {
    consola.debug("Access token expired or near expiry, refreshing...");
    token = await refreshToken(token);
  }

  return token.access_token;
}

export async function getAuthHeaders() {
  const envAuth = getEnvAuth();
  if (envAuth) {
    return { Authorization: `Bearer ${envAuth.apiKey}` } as const;
  }

  const accessToken = await getValidToken();
  return { Authorization: `Bearer ${accessToken}` } as const;
}

export async function getBaseUrl() {
  const envAuth = getEnvAuth();
  if (envAuth) {
    return envAuth.baseUrl;
  }

  const token = await loadToken();
  if (token?.base_url) {
    return token.base_url;
  }

  handleCancel("Base URL not specified");
}

export async function logoutStoredToken() {
  try {
    await fs.unlink(TOKEN_FILE);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      handleCancel("No token was stored.");
    }
    throw err;
  }
}
