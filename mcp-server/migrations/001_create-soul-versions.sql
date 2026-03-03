-- Soul versioning: temporal table for soul.md content
-- Each row represents one version. Exactly one row has valid_until = NULL (the active version).

CREATE TABLE soul_versions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content     TEXT NOT NULL,
    valid_from  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ
);

-- Enforce at most one active version at database level
CREATE UNIQUE INDEX idx_soul_versions_active
    ON soul_versions ((true))
    WHERE valid_until IS NULL;

-- Efficient lookup by point-in-time
CREATE INDEX idx_soul_versions_temporal
    ON soul_versions (valid_from DESC, valid_until);

--- Down migration
-- DROP TABLE soul_versions;
