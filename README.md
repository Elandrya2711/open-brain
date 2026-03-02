# Open Brain - Self-Hosted AI Knowledge System

A self-hosted, AI-readable knowledge management system that stores conversations, insights, and context persistently across all AI tools via an MCP Server.

## Architecture

```
Claude Code
    ↓
/remember Skill
    ↓
MCP Server (stdio transport)
    ↓
    ├─ store_memory → OpenAI Embeddings → PostgreSQL + pgvector
    ├─ semantic_search
    ├─ list_recent
    ├─ get_stats
    └─ delete_memory
```

## Features

- **Semantic Memory Storage**: Uses OpenAI embeddings (text-embedding-3-small) to store memories with vector embeddings
- **Vector Similarity Search**: Find memories based on semantic meaning, not exact keywords
- **MCP Integration**: Works with any MCP-compatible AI tool (Claude Code, Claude.ai, custom integrations)
- **Docker-Ready**: Complete Docker Compose setup for local deployment
- **Type Support**: Store different memory types (qa, chat, note)
- **HTTP + stdio Transports**: Works locally via stdio and remotely via HTTP with Bearer token auth

## Quick Start

### Prerequisites

- Docker & Docker Compose
- OpenAI API Key
- Environment variables configured

### Installation

```bash
# Clone/setup the project
cd /home/thilo/Projects/AiBrain

# Create .env from template
cp .env.example .env

# Edit .env with your credentials
# OPENAI_API_KEY=sk-...
# POSTGRES_PASSWORD=your-secure-password
# OPEN_BRAIN_API_KEY=your-random-api-key
```

### Running

```bash
# Build and start all services
docker compose up -d

# Check logs
docker compose logs -f mcp-server
docker compose logs -f postgres

# Verify PostgreSQL is ready
docker exec aibrain-postgres pg_isready -U openbrain
```

### Using in Claude Code

The MCP server is configured in `~/.claude/claude.json`. Once Docker is running:

```
/remember
# Stores last Q&A pair

/remember my fears about leasing
# Extracts and stores only relevant fears from conversation

/remember all decisions
# Extracts all decisions made in this chat
```

## API Endpoints

### HTTP Endpoints (with Bearer token auth)

**Health Check** (no auth required):
```bash
curl http://localhost:3000/health
```

**List Tools**:
```bash
curl -H "Authorization: Bearer $OPEN_BRAIN_API_KEY" \
  http://localhost:3000/mcp/tools
```

**Call Tool**:
```bash
curl -X POST http://localhost:3000/mcp/call-tool \
  -H "Authorization: Bearer $OPEN_BRAIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "store_memory",
    "arguments": {
      "content": "My memory content",
      "type": "note"
    }
  }'
```

## Database Schema

The PostgreSQL database includes:

- **memories** table with columns:
  - `id`: UUID primary key
  - `content`: Full text of the memory
  - `summary`: Optional brief summary
  - `embedding`: 1536-dimensional vector (pgvector)
  - `type`: Memory type (qa, chat, note)
  - `source`: Source of memory (claude-code, etc.)
  - `created_at`: Timestamp
  - `updated_at`: Timestamp

- **Indexes**:
  - ivfflat index on embedding vector for fast similarity search
  - Composite index on (type, created_at) for filtering

## MCP Tools

### 1. store_memory
Store a piece of knowledge with semantic embedding.

```typescript
store_memory(
  content: string,                    // Required: memory content
  type?: "qa" | "chat" | "note",     // Optional: memory type (default: "note")
  summary?: string                    // Optional: brief summary
)
```

**Response**:
```json
{
  "success": true,
  "id": "uuid",
  "message": "Memory stored successfully with type: note"
}
```

### 2. semantic_search
Search memories by semantic meaning.

```typescript
semantic_search(
  query: string,          // Required: search query
  limit?: number          // Optional: max results (default: 10, max: 100)
)
```

**Response**:
```json
{
  "success": true,
  "count": 3,
  "results": [
    {
      "id": "uuid",
      "content": "Memory content...",
      "summary": "Optional summary",
      "type": "note",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### 3. list_recent
List recently stored memories.

```typescript
list_recent(
  days?: number           // Optional: lookback period (default: 7)
)
```

**Response**:
```json
{
  "success": true,
  "count": 5,
  "days": 7,
  "memories": [
    {
      "id": "uuid",
      "content": "First 200 chars...",
      "summary": "Optional summary",
      "type": "note",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### 4. get_stats
Get statistics about stored memories.

```typescript
get_stats()
```

**Response**:
```json
{
  "success": true,
  "total": 42,
  "byType": {
    "note": 25,
    "qa": 10,
    "chat": 7
  },
  "dateRange": {
    "oldest": "2024-01-01T00:00:00Z",
    "newest": "2024-01-15T10:30:00Z"
  }
}
```

### 5. delete_memory
Delete a memory by ID.

```typescript
delete_memory(
  id: string              // Required: memory ID
)
```

**Response**:
```json
{
  "success": true,
  "message": "Memory {id} deleted successfully"
}
```

## Testing

```bash
cd mcp-server

# Run all tests
npm test

# Watch mode during development
npm run test:watch

# Coverage report
npm run test:coverage
```

Test coverage includes:
- ✅ store_memory tool with validation, embedding, storage
- ✅ semantic_search with query conversion, DB search, limit handling
- ✅ list_recent with date filtering, sorting, defaults
- ✅ get_stats with totals, type breakdown, time distribution
- ✅ delete_memory with successful deletion and error handling
- ✅ MCP server with tool registration, auth, error handling

## Extending with New Tools

New tools are added as modules in `mcp-server/src/tools/`. They are automatically registered.

### Adding a New Tool

1. Create a file: `mcp-server/src/tools/mytopic/mytool.ts`

```typescript
export const tool = {
  name: 'my_tool_name',
  description: 'What this tool does',
  inputSchema: {
    type: 'object' as const,
    properties: {
      param1: { type: 'string', description: 'Description' },
    },
    required: ['param1'],
  },
  handler: async (input: { param1?: string }) => {
    // Implementation
    return { success: true, result: '...' };
  },
};
```

2. Register in `mcp-server/src/tools/index.ts`:

```typescript
import { tool as myTool } from './mytopic/mytool.js';

export const tools: ToolDefinition[] = [
  // ... existing tools ...
  myTool,
];
```

3. Create tests: `mcp-server/src/tools/mytopic/mytool.test.ts`

4. Rebuild and restart:
```bash
docker compose up -d --build mcp-server
```

That's it! The new tool is now available via the MCP Server.

## Environment Variables

```bash
# OpenAI API Key (required)
OPENAI_API_KEY=sk-your-api-key

# PostgreSQL password (required)
POSTGRES_PASSWORD=your-secure-db-password

# Open Brain API Key for HTTP auth (required)
OPEN_BRAIN_API_KEY=random-secure-key-here

# Node environment
NODE_ENV=production
```

## Deployment to Coolify

1. Create a new service in Coolify from the Docker Compose file
2. Set all environment variables as secrets
3. Configure the health check: `GET http://localhost:3000/health`
4. Set restart policy: `always`
5. Enable volume persistence for PostgreSQL

## Troubleshooting

### MCP Server not connecting
```bash
# Check if container is running
docker ps | grep aibrain

# Check logs
docker logs aibrain-mcp-server-1

# Verify schema was initialized
docker exec aibrain-postgres psql -U openbrain -d openbrain -c "\d memories"
```

### Embedding generation fails
- Verify `OPENAI_API_KEY` is set and valid
- Check OpenAI API quota and billing
- Ensure text input is not empty

### Database connection issues
- Verify PostgreSQL is healthy: `docker compose ps`
- Check `DATABASE_URL` is correctly formatted
- Ensure `POSTGRES_PASSWORD` matches compose config

## Architecture Decisions

### Why 5 Tools?
Fewer, well-designed tools keep MCP context costs low. Claude Code v2.1.7+ has built-in lazy loading that automatically selects only relevant tools per request.

### Why pgvector?
- Native vector support in PostgreSQL
- ACID-compliant transactions
- IVFFLAT indexes for fast similarity search
- Cost-effective for self-hosted deployments

### Why OpenAI Embeddings?
- Stable, well-tested model (text-embedding-3-small)
- 1536 dimensions is a good balance of performance/cost
- Works with any OpenAI-compatible API provider

### Stdio vs HTTP Transport
- **Stdio**: Local Claude Code sessions (fast, no auth needed)
- **HTTP**: External clients (Claude.ai, custom tools, remote services)

## Contributing

To add new tools, features, or improve existing ones:

1. Create a feature branch
2. Add tests for any new functionality
3. Ensure all tests pass: `npm test`
4. Verify coverage remains >80%
5. Submit PR with description of changes

## License

MIT - See LICENSE file

## Support

For issues or questions:
- Check logs: `docker compose logs -f`
- Review test cases for usage examples
- Read the MCP Server documentation
