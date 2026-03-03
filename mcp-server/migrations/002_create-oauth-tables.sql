-- OAuth persistence: client registrations and refresh tokens

CREATE TABLE oauth_clients (
    client_id                   TEXT PRIMARY KEY,
    client_name                 TEXT,
    redirect_uris               TEXT[] NOT NULL,
    grant_types                 TEXT[] NOT NULL DEFAULT '{authorization_code}',
    response_types              TEXT[] NOT NULL DEFAULT '{code}',
    token_endpoint_auth_method  TEXT NOT NULL DEFAULT 'none',
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE oauth_refresh_tokens (
    token_hash  TEXT PRIMARY KEY,
    client_id   TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    scope       TEXT NOT NULL DEFAULT 'mcp:tools',
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_oauth_refresh_tokens_client
    ON oauth_refresh_tokens (client_id);

CREATE INDEX idx_oauth_refresh_tokens_expires
    ON oauth_refresh_tokens (expires_at);

--- Down migration
-- DROP TABLE oauth_refresh_tokens;
-- DROP TABLE oauth_clients;
