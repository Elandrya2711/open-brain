-- Create pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create memories table with vector embeddings
CREATE TABLE memories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content     TEXT NOT NULL,
  summary     TEXT,
  embedding   vector(1536),
  type        TEXT DEFAULT 'note',
  source      TEXT DEFAULT 'claude-code',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for efficient vector similarity search
CREATE INDEX ON memories USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Create index for quick filtering by type and date
CREATE INDEX idx_memories_type_created ON memories (type, created_at DESC);
CREATE INDEX idx_memories_created ON memories (created_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_memories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER trigger_memories_updated_at
BEFORE UPDATE ON memories
FOR EACH ROW
EXECUTE FUNCTION update_memories_updated_at();
