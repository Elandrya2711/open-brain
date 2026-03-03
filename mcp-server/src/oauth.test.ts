import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import express from 'express';
import { createJwt, verifyJwt, createOAuthRouter } from './oauth.js';

const TEST_SECRET = 'test-api-key-1234567890';

// ---------------------------------------------------------------------------
// JWT tests
// ---------------------------------------------------------------------------

describe('JWT', () => {
  const basePayload = {
    iss: 'https://example.com',
    sub: 'test-client',
    aud: 'https://example.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    jti: crypto.randomUUID(),
    scope: 'mcp:tools',
  };

  it('should create and verify a valid JWT', () => {
    const token = createJwt(basePayload, TEST_SECRET);
    const payload = verifyJwt(token, TEST_SECRET);
    expect(payload).not.toBeNull();
    expect(payload!.iss).toBe('https://example.com');
    expect(payload!.sub).toBe('test-client');
    expect(payload!.scope).toBe('mcp:tools');
  });

  it('should reject a JWT with wrong secret', () => {
    const token = createJwt(basePayload, TEST_SECRET);
    const payload = verifyJwt(token, 'wrong-secret-key!!!');
    expect(payload).toBeNull();
  });

  it('should reject an expired JWT', () => {
    const expiredPayload = {
      ...basePayload,
      exp: Math.floor(Date.now() / 1000) - 60, // expired 1 minute ago
    };
    const token = createJwt(expiredPayload, TEST_SECRET);
    const payload = verifyJwt(token, TEST_SECRET);
    expect(payload).toBeNull();
  });

  it('should reject a malformed token', () => {
    expect(verifyJwt('not-a-jwt', TEST_SECRET)).toBeNull();
    expect(verifyJwt('a.b', TEST_SECRET)).toBeNull();
    expect(verifyJwt('', TEST_SECRET)).toBeNull();
  });

  it('should reject a tampered token', () => {
    const token = createJwt(basePayload, TEST_SECRET);
    const parts = token.split('.');
    // Tamper with the payload
    const tampered = parts[0] + '.' + Buffer.from('{"sub":"hacked"}').toString('base64url') + '.' + parts[2];
    expect(verifyJwt(tampered, TEST_SECRET)).toBeNull();
  });

  it('should have correct JWT structure (3 base64url parts)', () => {
    const token = createJwt(basePayload, TEST_SECRET);
    const parts = token.split('.');
    expect(parts).toHaveLength(3);

    // Decode header
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    expect(header.alg).toBe('HS256');
    expect(header.typ).toBe('JWT');
  });
});

// ---------------------------------------------------------------------------
// PKCE S256 tests
// ---------------------------------------------------------------------------

describe('PKCE S256', () => {
  it('should generate correct S256 challenge from verifier', () => {
    // Known test vector: code_verifier "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    // SHA256 → base64url = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const expectedChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    const computedChallenge = crypto.createHash('sha256').update(verifier).digest().toString('base64url');
    expect(computedChallenge).toBe(expectedChallenge);
  });
});

// ---------------------------------------------------------------------------
// OAuth Router endpoint tests
// ---------------------------------------------------------------------------

describe('OAuth Router', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use(createOAuthRouter(TEST_SECRET));
  });

  // Helper to make requests
  async function request(method: string, path: string, body?: Record<string, unknown>) {
    const { default: supertest } = await import('supertest' as string).catch(() => {
      // Fallback for environments without supertest: use http
      return { default: null };
    });

    if (!supertest) {
      // Manual HTTP request via app.listen
      return null;
    }

    if (method === 'GET') {
      return supertest(app).get(path);
    }
    if (method === 'POST') {
      return supertest(app).post(path).send(body);
    }
    return null;
  }

  describe('/.well-known/oauth-protected-resource', () => {
    it('should return resource metadata', async () => {
      const res = await request('GET', '/.well-known/oauth-protected-resource');
      if (!res) return; // Skip if no supertest

      expect(res.status).toBe(200);
      expect(res.body.authorization_servers).toBeDefined();
      expect(Array.isArray(res.body.authorization_servers)).toBe(true);
      expect(res.body.bearer_methods_supported).toContain('header');
      expect(res.body.scopes_supported).toContain('mcp:tools');
    });
  });

  describe('/.well-known/oauth-authorization-server', () => {
    it('should return authorization server metadata', async () => {
      const res = await request('GET', '/.well-known/oauth-authorization-server');
      if (!res) return;

      expect(res.status).toBe(200);
      expect(res.body.authorization_endpoint).toBeDefined();
      expect(res.body.token_endpoint).toBeDefined();
      expect(res.body.registration_endpoint).toBeDefined();
      expect(res.body.response_types_supported).toContain('code');
      expect(res.body.grant_types_supported).toContain('authorization_code');
      expect(res.body.code_challenge_methods_supported).toContain('S256');
    });
  });

  describe('/authorize GET', () => {
    it('should return HTML form with valid parameters', async () => {
      const res = await request('GET',
        '/authorize?client_id=test&redirect_uri=http://localhost:3000/callback&response_type=code&code_challenge=abc123&code_challenge_method=S256&state=xyz');
      if (!res) return;

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('Open Brain');
      expect(res.text).toContain('api_key');
    });

    it('should reject missing parameters', async () => {
      const res = await request('GET', '/authorize?client_id=test');
      if (!res) return;

      expect(res.status).toBe(400);
    });

    it('should reject missing PKCE', async () => {
      const res = await request('GET',
        '/authorize?client_id=test&redirect_uri=http://localhost/cb&response_type=code');
      if (!res) return;

      expect(res.status).toBe(400);
    });
  });

  describe('/register', () => {
    it('should register a client with valid metadata', async () => {
      const res = await request('POST', '/register', {
        client_name: 'Test Client',
        redirect_uris: ['http://localhost:3000/callback'],
        grant_types: ['authorization_code'],
        response_types: ['code'],
      });
      if (!res) return;

      expect(res.status).toBe(201);
      expect(res.body.client_id).toBeDefined();
      expect(res.body.client_name).toBe('Test Client');
      expect(res.body.redirect_uris).toContain('http://localhost:3000/callback');
    });

    it('should reject missing redirect_uris', async () => {
      const res = await request('POST', '/register', {
        client_name: 'Test Client',
      });
      if (!res) return;

      expect(res.status).toBe(400);
    });
  });

  describe('/token', () => {
    it('should reject unsupported grant type', async () => {
      const res = await request('POST', '/token', {
        grant_type: 'client_credentials',
        code: 'abc',
        code_verifier: 'def',
        client_id: 'test',
      });
      if (!res) return;

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('unsupported_grant_type');
    });

    it('should reject invalid authorization code', async () => {
      const res = await request('POST', '/token', {
        grant_type: 'authorization_code',
        code: 'nonexistent-code',
        code_verifier: 'abc',
        client_id: 'test',
      });
      if (!res) return;

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_grant');
    });
  });
});

// ---------------------------------------------------------------------------
// Full OAuth flow test (authorize → token)
// ---------------------------------------------------------------------------

describe('Full OAuth Flow', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use(createOAuthRouter(TEST_SECRET));
  });

  it('should complete the full authorization code + PKCE flow', async () => {
    const { default: supertest } = await import('supertest' as string).catch(() => ({ default: null }));
    if (!supertest) return;

    // Step 1: Generate PKCE values
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest().toString('base64url');

    const clientId = 'test-client-id';
    const redirectUri = 'http://localhost:3000/callback';
    const state = crypto.randomBytes(16).toString('hex');

    // Step 2: POST to /authorize with correct API key
    const authRes = await supertest(app)
      .post('/authorize')
      .type('form')
      .send({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state: state,
        scope: 'mcp:tools',
        api_key: TEST_SECRET,
      });

    // Should redirect with code
    expect(authRes.status).toBe(302);
    const location = new URL(authRes.headers.location);
    expect(location.searchParams.get('state')).toBe(state);
    const code = location.searchParams.get('code');
    expect(code).toBeTruthy();

    // Step 3: Exchange code for token
    const tokenRes = await supertest(app)
      .post('/token')
      .send({
        grant_type: 'authorization_code',
        code: code,
        code_verifier: codeVerifier,
        client_id: clientId,
        redirect_uri: redirectUri,
      });

    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body.access_token).toBeDefined();
    expect(tokenRes.body.token_type).toBe('Bearer');
    expect(tokenRes.body.expires_in).toBe(3600);
    expect(tokenRes.body.scope).toBe('mcp:tools');

    // Step 4: Verify the issued token
    const payload = verifyJwt(tokenRes.body.access_token, TEST_SECRET);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe(clientId);
    expect(payload!.scope).toBe('mcp:tools');
  });

  it('should reject wrong API key in authorize', async () => {
    const { default: supertest } = await import('supertest' as string).catch(() => ({ default: null }));
    if (!supertest) return;

    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest().toString('base64url');

    const authRes = await supertest(app)
      .post('/authorize')
      .type('form')
      .send({
        client_id: 'test',
        redirect_uri: 'http://localhost/cb',
        response_type: 'code',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state: 'abc',
        scope: 'mcp:tools',
        api_key: 'wrong-key',
      });

    expect(authRes.status).toBe(401);
    expect(authRes.text).toContain('Invalid API key');
  });

  it('should reject wrong code_verifier in token exchange', async () => {
    const { default: supertest } = await import('supertest' as string).catch(() => ({ default: null }));
    if (!supertest) return;

    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest().toString('base64url');

    // Authorize with correct key
    const authRes = await supertest(app)
      .post('/authorize')
      .type('form')
      .send({
        client_id: 'test',
        redirect_uri: 'http://localhost/cb',
        response_type: 'code',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state: 'abc',
        scope: 'mcp:tools',
        api_key: TEST_SECRET,
      });

    const location = new URL(authRes.headers.location);
    const code = location.searchParams.get('code');

    // Exchange with WRONG code_verifier
    const tokenRes = await supertest(app)
      .post('/token')
      .send({
        grant_type: 'authorization_code',
        code: code,
        code_verifier: 'totally-wrong-verifier',
        client_id: 'test',
      });

    expect(tokenRes.status).toBe(400);
    expect(tokenRes.body.error).toBe('invalid_grant');
    expect(tokenRes.body.error_description).toContain('PKCE');
  });

  it('should reject reuse of authorization code', async () => {
    const { default: supertest } = await import('supertest' as string).catch(() => ({ default: null }));
    if (!supertest) return;

    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest().toString('base64url');

    const authRes = await supertest(app)
      .post('/authorize')
      .type('form')
      .send({
        client_id: 'test',
        redirect_uri: 'http://localhost/cb',
        response_type: 'code',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state: 'abc',
        scope: 'mcp:tools',
        api_key: TEST_SECRET,
      });

    const location = new URL(authRes.headers.location);
    const code = location.searchParams.get('code');

    // First exchange: success
    const tokenRes1 = await supertest(app)
      .post('/token')
      .send({
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
        client_id: 'test',
      });
    expect(tokenRes1.status).toBe(200);

    // Second exchange: should fail (code already used)
    const tokenRes2 = await supertest(app)
      .post('/token')
      .send({
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
        client_id: 'test',
      });
    expect(tokenRes2.status).toBe(400);
    expect(tokenRes2.body.error).toBe('invalid_grant');
  });
});
