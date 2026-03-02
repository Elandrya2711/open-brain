import { Pool } from 'pg';

// Build pool config from environment variables
// Prefer individual config vars over DATABASE_URL to avoid URL-encoding issues
// with special characters in passwords (e.g., #, !, @)
const dbUrl = process.env.DATABASE_URL;
const hasIndividualVars = !!(process.env.DB_HOST || process.env.DB_USER || process.env.DB_PASSWORD);

console.error('[db] Configuration:', {
  databaseUrl: dbUrl ? `${dbUrl.substring(0, 50)}...` : 'NOT SET',
  hasIndividualVars,
});

let poolConfig: any;

// Prefer individual config variables for better special-char handling
if (hasIndividualVars || !dbUrl) {
  // Use individual environment variables (safer for special characters)
  const host = process.env.DB_HOST || 'postgres';
  const port = parseInt(process.env.DB_PORT || '5432', 10);
  const user = process.env.DB_USER || 'openbrain';
  const password = process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || '';
  const database = process.env.DB_NAME || 'openbrain';

  console.error('[db] Using individual connection config:', {
    host,
    port,
    user,
    database,
    hasPassword: !!password,
  });

  poolConfig = {
    host,
    port,
    user,
    password,
    database,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };
} else {
  // Fallback to DATABASE_URL if no individual vars set
  console.error('[db] Using DATABASE_URL connection string (may fail with special-char passwords)');
  poolConfig = { connectionString: dbUrl };
}

const pool = new Pool(poolConfig);

// Log connection events
pool.on('error', (err) => {
  console.error('[db] Connection pool error:', err instanceof Error ? err.message : err);
});

pool.on('connect', () => {
  console.error('[db] Connection pool connected successfully');
});

// Auto-migration: Initialize schema if it doesn't exist
async function initializeSchema() {
  try {
    console.error('[db.migration] Checking database schema...');

    // Check if pgvector extension exists, create if missing
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector;');
    console.error('[db.migration] pgvector extension OK');

    // Check if memories table exists
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'memories'
      );
    `);

    if (!tableExists.rows[0].exists) {
      console.error('[db.migration] Creating memories table...');
      await pool.query(`
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
      `);
      console.error('[db.migration] Memories table created');
    } else {
      console.error('[db.migration] Memories table exists');
    }

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_memories_embedding
      ON memories USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
    `);
    console.error('[db.migration] Embedding index OK');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_memories_type_created
      ON memories (type, created_at DESC);
    `);
    console.error('[db.migration] Type/date index OK');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_memories_created
      ON memories (created_at DESC);
    `);
    console.error('[db.migration] Created date index OK');

    // Create trigger function and trigger
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_memories_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.error('[db.migration] Trigger function OK');

    await pool.query(`
      DROP TRIGGER IF EXISTS trigger_memories_updated_at ON memories;
      CREATE TRIGGER trigger_memories_updated_at
      BEFORE UPDATE ON memories
      FOR EACH ROW
      EXECUTE FUNCTION update_memories_updated_at();
    `);
    console.error('[db.migration] Update trigger OK');

    console.error('[db.migration] ✅ Schema initialization complete');
  } catch (error) {
    console.error('[db.migration] ❌ Error initializing schema:',
      error instanceof Error ? error.message : error);
    throw error;
  }
}

// Initialize schema on startup
initializeSchema().catch(error => {
  console.error('[db] Fatal: Schema initialization failed:', error);
  process.exit(1);
});

export interface Memory {
  id: string;
  content: string;
  summary?: string;
  embedding: number[];
  type: string;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface MemoryStats {
  total: number;
  byType: Record<string, number>;
  oldestDate: string;
  newestDate: string;
}

export async function insertMemory(
  content: string,
  embedding: number[],
  type: string = 'note',
  source: string = 'claude-code',
  summary?: string
): Promise<string> {
  console.error('[db.insertMemory] Called with:', {
    contentLength: content?.length,
    embeddingLength: embedding?.length,
    type,
    source,
    hasSummary: !!summary,
  });

  const query = `
    INSERT INTO memories (content, embedding, type, source, summary)
    VALUES ($1, $2::vector, $3, $4, $5)
    RETURNING id
  `;

  try {
    console.error('[db.insertMemory] Executing query...');
    const result = await pool.query(query, [
      content,
      JSON.stringify(embedding),
      type,
      source,
      summary || null,
    ]);

    const id = result.rows[0].id;
    console.error('[db.insertMemory] Successfully inserted with id:', id);
    return id;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[db.insertMemory] Error:', errorMsg, error);
    if (error instanceof Error) {
      throw new Error(`Failed to insert memory: ${error.message}`);
    }
    throw error;
  }
}

export async function similaritySearch(
  queryEmbedding: number[],
  limit: number = 10
): Promise<Memory[]> {
  const query = `
    SELECT
      id,
      content,
      summary,
      embedding,
      type,
      source,
      created_at,
      updated_at,
      embedding <=> $1::vector AS distance
    FROM memories
    ORDER BY embedding <=> $1::vector
    LIMIT $2
  `;

  try {
    const result = await pool.query(query, [
      JSON.stringify(queryEmbedding),
      limit,
    ]);

    return result.rows.map(row => ({
      id: row.id,
      content: row.content,
      summary: row.summary,
      embedding: row.embedding,
      type: row.type,
      source: row.source,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Search failed: ${error.message}`);
    }
    throw error;
  }
}

export async function getRecentMemories(days: number = 7): Promise<Memory[]> {
  const query = `
    SELECT
      id,
      content,
      summary,
      embedding,
      type,
      source,
      created_at,
      updated_at
    FROM memories
    WHERE created_at >= NOW() - INTERVAL '1 day' * $1
    ORDER BY created_at DESC
  `;

  try {
    const result = await pool.query(query, [days]);
    return result.rows.map(row => ({
      id: row.id,
      content: row.content,
      summary: row.summary,
      embedding: row.embedding,
      type: row.type,
      source: row.source,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch recent memories: ${error.message}`);
    }
    throw error;
  }
}

export async function getStats(): Promise<MemoryStats> {
  const query = `
    SELECT
      COUNT(*) as total,
      MIN(created_at) as oldest_date,
      MAX(created_at) as newest_date
    FROM memories
  `;

  const typeQuery = `
    SELECT type, COUNT(*) as count
    FROM memories
    GROUP BY type
  `;

  try {
    const statsResult = await pool.query(query);
    const typeResult = await pool.query(typeQuery);

    const stats = statsResult.rows[0];
    const byType: Record<string, number> = {};

    typeResult.rows.forEach(row => {
      byType[row.type] = parseInt(row.count, 10);
    });

    return {
      total: parseInt(stats.total, 10),
      byType,
      oldestDate: stats.oldest_date || '',
      newestDate: stats.newest_date || '',
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch stats: ${error.message}`);
    }
    throw error;
  }
}

export async function deleteMemory(id: string): Promise<boolean> {
  const query = 'DELETE FROM memories WHERE id = $1 RETURNING id';

  try {
    const result = await pool.query(query, [id]);
    return result.rowCount !== null && result.rowCount > 0;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to delete memory: ${error.message}`);
    }
    throw error;
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}

export default pool;
