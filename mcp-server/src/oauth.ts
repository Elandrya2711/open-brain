import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { saveClient, getClient, saveRefreshToken, getRefreshToken, deleteRefreshToken } from './db.js';

// ---------------------------------------------------------------------------
// JWT helpers (HMAC-SHA256, no external dependency)
// ---------------------------------------------------------------------------

function base64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function base64urlDecode(str: string): Buffer {
  return Buffer.from(str, 'base64url');
}

interface JwtPayload {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  jti: string;
  scope: string;
  [key: string]: unknown;
}

export function createJwt(payload: JwtPayload, secret: string): string {
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = base64url(Buffer.from(JSON.stringify(payload)));
  const signature = base64url(
    crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest(),
  );
  return `${header}.${body}.${signature}`;
}

export function verifyJwt(token: string, secret: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;

  // Verify signature
  const expectedSig = base64url(
    crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest(),
  );

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    return null;
  }

  // Decode payload
  try {
    const payload = JSON.parse(base64urlDecode(body).toString()) as JwtPayload;

    // Check expiration
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

interface AuthCodeEntry {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  expiresAt: number;
}

const authCodes = new Map<string, AuthCodeEntry>();

// Periodic cleanup of expired auth codes (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of authCodes) {
    if (now > entry.expiresAt) authCodes.delete(code);
  }
}, 5 * 60 * 1000);

// Refresh token lifetime: 30 days
const REFRESH_TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

function computeS256Challenge(codeVerifier: string): string {
  return base64url(crypto.createHash('sha256').update(codeVerifier).digest());
}

// ---------------------------------------------------------------------------
// Helper: derive base URL from request
// ---------------------------------------------------------------------------

function getBaseUrl(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'localhost:3000';
  return `${proto}://${host}`;
}

// ---------------------------------------------------------------------------
// Authorize page HTML
// ---------------------------------------------------------------------------

function renderAuthorizePage(params: {
  clientId: string;
  redirectUri: string;
  responseType: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string;
  scope: string;
  error?: string;
}): string {
  const errorHtml = params.error
    ? `<div style="background:#fee;border:1px solid #c00;padding:10px;border-radius:6px;margin-bottom:16px;color:#c00;">${params.error}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Open Brain – Authorize</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           background: #f5f5f5; display: flex; justify-content: center; align-items: center;
           min-height: 100vh; padding: 20px; }
    .card { background: white; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.1);
            padding: 32px; max-width: 420px; width: 100%; }
    h1 { font-size: 1.4em; margin-bottom: 8px; }
    .subtitle { color: #666; margin-bottom: 20px; font-size: 0.9em; }
    .client-info { background: #f8f9fa; border-radius: 8px; padding: 12px; margin-bottom: 20px; }
    .client-info .label { font-size: 0.8em; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
    .client-info .value { font-weight: 600; word-break: break-all; }
    .scope-badge { display: inline-block; background: #e3f2fd; color: #1565c0; padding: 4px 10px;
                   border-radius: 12px; font-size: 0.85em; margin-top: 4px; }
    label { display: block; font-weight: 600; margin-bottom: 6px; font-size: 0.9em; }
    input[type="password"] { width: 100%; padding: 10px 14px; border: 1px solid #ddd;
                              border-radius: 8px; font-size: 1em; margin-bottom: 16px; }
    input[type="password"]:focus { outline: none; border-color: #4a90d9; box-shadow: 0 0 0 3px rgba(74,144,217,0.15); }
    .buttons { display: flex; gap: 10px; }
    button { flex: 1; padding: 12px; border: none; border-radius: 8px; font-size: 1em; cursor: pointer;
             font-weight: 600; transition: background 0.2s; }
    .btn-primary { background: #4a90d9; color: white; }
    .btn-primary:hover { background: #3a7bc8; }
    .btn-deny { background: #f0f0f0; color: #666; }
    .btn-deny:hover { background: #e0e0e0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Open Brain</h1>
    <p class="subtitle">MCP Server Authorization</p>
    ${errorHtml}
    <div class="client-info">
      <div class="label">Application</div>
      <div class="value">${escapeHtml(params.clientId)}</div>
      <div style="margin-top:8px">
        <div class="label">Requested access</div>
        <span class="scope-badge">${escapeHtml(params.scope || 'mcp:tools')}</span>
      </div>
    </div>
    <form method="POST" action="/authorize">
      <input type="hidden" name="client_id" value="${escapeAttr(params.clientId)}">
      <input type="hidden" name="redirect_uri" value="${escapeAttr(params.redirectUri)}">
      <input type="hidden" name="response_type" value="${escapeAttr(params.responseType)}">
      <input type="hidden" name="code_challenge" value="${escapeAttr(params.codeChallenge)}">
      <input type="hidden" name="code_challenge_method" value="${escapeAttr(params.codeChallengeMethod)}">
      <input type="hidden" name="state" value="${escapeAttr(params.state)}">
      <input type="hidden" name="scope" value="${escapeAttr(params.scope)}">
      <label for="api_key">API Key</label>
      <input type="password" id="api_key" name="api_key" placeholder="Enter your Open Brain API key" required autofocus>
      <div class="buttons">
        <button type="button" class="btn-deny" onclick="window.location.href='${escapeAttr(params.redirectUri)}?error=access_denied&state=${escapeAttr(params.state)}'">Deny</button>
        <button type="submit" class="btn-primary">Authorize</button>
      </div>
    </form>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// OAuth Router factory
// ---------------------------------------------------------------------------

export function createOAuthRouter(apiKey: string): Router {
  const router = Router();

  // ---- Resource Metadata (RFC 9728) ----
  router.get('/.well-known/oauth-protected-resource', (req: Request, res: Response) => {
    const baseUrl = getBaseUrl(req);
    res.json({
      resource: baseUrl,
      authorization_servers: [baseUrl],
      bearer_methods_supported: ['header'],
      scopes_supported: ['mcp:tools'],
    });
  });

  // ---- Authorization Server Metadata (RFC 8414) ----
  router.get('/.well-known/oauth-authorization-server', (req: Request, res: Response) => {
    const baseUrl = getBaseUrl(req);
    res.json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/authorize`,
      token_endpoint: `${baseUrl}/token`,
      registration_endpoint: `${baseUrl}/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['mcp:tools'],
      client_id_metadata_document_supported: true,
    });
  });

  // ---- Authorization Endpoint (GET → form) ----
  router.get('/authorize', (req: Request, res: Response) => {
    const clientId = (req.query.client_id as string) || '';
    const redirectUri = (req.query.redirect_uri as string) || '';
    const responseType = (req.query.response_type as string) || '';
    const codeChallenge = (req.query.code_challenge as string) || '';
    const codeChallengeMethod = (req.query.code_challenge_method as string) || '';
    const state = (req.query.state as string) || '';
    const scope = (req.query.scope as string) || 'mcp:tools';

    // Validate required parameters
    if (!clientId || !redirectUri || responseType !== 'code') {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameters: client_id, redirect_uri, response_type=code',
      });
    }

    if (!codeChallenge || codeChallengeMethod !== 'S256') {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'PKCE required: code_challenge and code_challenge_method=S256',
      });
    }

    res.setHeader('Content-Type', 'text/html');
    res.send(renderAuthorizePage({
      clientId,
      redirectUri,
      responseType,
      codeChallenge,
      codeChallengeMethod,
      state,
      scope,
    }));
  });

  // ---- Authorization Endpoint (POST → validate & redirect) ----
  router.post('/authorize', (req: Request, res: Response) => {
    const {
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: responseType,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      state,
      scope,
      api_key: userApiKey,
    } = req.body;

    // Validate required fields
    if (!clientId || !redirectUri || responseType !== 'code') {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameters',
      });
    }

    if (!codeChallenge || codeChallengeMethod !== 'S256') {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'PKCE required',
      });
    }

    // Validate API key (constant-time comparison)
    if (!userApiKey || !crypto.timingSafeEqual(
      Buffer.from(userApiKey.padEnd(apiKey.length)),
      Buffer.from(apiKey.padEnd(userApiKey.length)),
    ) || userApiKey.length !== apiKey.length) {
      // Re-render form with error
      res.setHeader('Content-Type', 'text/html');
      return res.status(401).send(renderAuthorizePage({
        clientId,
        redirectUri,
        responseType,
        codeChallenge,
        codeChallengeMethod,
        state: state || '',
        scope: scope || 'mcp:tools',
        error: 'Invalid API key. Please try again.',
      }));
    }

    // Generate authorization code
    const code = crypto.randomBytes(32).toString('hex');
    authCodes.set(code, {
      clientId,
      redirectUri,
      codeChallenge,
      scope: scope || 'mcp:tools',
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    });

    // Redirect back to client with code
    const redirectUrl = new URL(redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (state) redirectUrl.searchParams.set('state', state);

    res.redirect(302, redirectUrl.toString());
  });

  // ---- Helper: issue access + refresh token pair ----
  async function issueTokenPair(req: Request, res: Response, clientId: string, scope: string) {
    const baseUrl = getBaseUrl(req);
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 3600; // 1 hour

    const payload: JwtPayload = {
      iss: baseUrl,
      sub: clientId,
      aud: baseUrl,
      exp: now + expiresIn,
      iat: now,
      jti: crypto.randomUUID(),
      scope,
    };

    const accessToken = createJwt(payload, apiKey);

    // Generate refresh token and persist its hash
    const refreshToken = crypto.randomBytes(32).toString('hex');
    const refreshHash = hashToken(refreshToken);
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_LIFETIME_MS);

    // Ensure client exists (some clients skip /register and use metadata URLs as client_id)
    await saveClient({
      clientId,
      redirectUris: ['https://localhost'],
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      tokenEndpointAuthMethod: 'none',
    });

    await saveRefreshToken(refreshHash, clientId, scope, refreshExpiresAt);

    res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      scope,
      refresh_token: refreshToken,
    });
  }

  // ---- Token Endpoint ----
  router.post('/token', async (req: Request, res: Response) => {
    const {
      grant_type: grantType,
      code,
      code_verifier: codeVerifier,
      client_id: clientId,
      redirect_uri: redirectUri,
      refresh_token: refreshTokenValue,
    } = req.body;

    // ----- authorization_code grant -----
    if (grantType === 'authorization_code') {
      if (!code || !codeVerifier || !clientId) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing required parameters: code, code_verifier, client_id',
        });
      }

      // Lookup authorization code
      const codeEntry = authCodes.get(code);
      if (!codeEntry) {
        return res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Invalid or expired authorization code',
        });
      }

      // Delete code immediately (single use)
      authCodes.delete(code);

      // Check expiration
      if (Date.now() > codeEntry.expiresAt) {
        return res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Authorization code has expired',
        });
      }

      // Validate client_id matches
      if (codeEntry.clientId !== clientId) {
        return res.status(400).json({
          error: 'invalid_grant',
          error_description: 'client_id does not match',
        });
      }

      // Validate redirect_uri if provided
      if (redirectUri && codeEntry.redirectUri !== redirectUri) {
        return res.status(400).json({
          error: 'invalid_grant',
          error_description: 'redirect_uri does not match',
        });
      }

      // Validate PKCE code_verifier against stored code_challenge (S256)
      const computedChallenge = computeS256Challenge(codeVerifier);
      if (computedChallenge !== codeEntry.codeChallenge) {
        return res.status(400).json({
          error: 'invalid_grant',
          error_description: 'PKCE verification failed',
        });
      }

      return await issueTokenPair(req, res, clientId, codeEntry.scope);
    }

    // ----- refresh_token grant -----
    if (grantType === 'refresh_token') {
      if (!refreshTokenValue || !clientId) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing required parameters: refresh_token, client_id',
        });
      }

      const tokenHash = hashToken(refreshTokenValue);
      const stored = await getRefreshToken(tokenHash);

      if (!stored) {
        return res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Invalid or expired refresh token',
        });
      }

      if (stored.clientId !== clientId) {
        // Possible token theft — delete the token
        await deleteRefreshToken(tokenHash);
        return res.status(400).json({
          error: 'invalid_grant',
          error_description: 'client_id does not match',
        });
      }

      // Token rotation: delete old token, issue new pair
      await deleteRefreshToken(tokenHash);
      return await issueTokenPair(req, res, clientId, stored.scope);
    }

    return res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: 'Supported grant types: authorization_code, refresh_token',
    });
  });

  // ---- Dynamic Client Registration (RFC 7591) ----
  router.post('/register', async (req: Request, res: Response) => {
    const {
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: grantTypes,
      response_types: responseTypes,
      token_endpoint_auth_method: tokenEndpointAuthMethod,
    } = req.body;

    if (!redirectUris || !Array.isArray(redirectUris) || redirectUris.length === 0) {
      return res.status(400).json({
        error: 'invalid_client_metadata',
        error_description: 'redirect_uris is required and must be a non-empty array',
      });
    }

    const clientId = crypto.randomUUID();

    const registration = {
      clientId,
      clientName: clientName || undefined,
      redirectUris,
      grantTypes: grantTypes || ['authorization_code'],
      responseTypes: responseTypes || ['code'],
      tokenEndpointAuthMethod: tokenEndpointAuthMethod || 'none',
    };

    await saveClient(registration);

    res.status(201).json({
      client_id: clientId,
      client_name: registration.clientName,
      redirect_uris: registration.redirectUris,
      grant_types: registration.grantTypes,
      response_types: registration.responseTypes,
      token_endpoint_auth_method: registration.tokenEndpointAuthMethod,
    });
  });

  return router;
}
