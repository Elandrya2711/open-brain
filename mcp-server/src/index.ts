import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  TextContent,
} from '@modelcontextprotocol/sdk/types.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { tools, getTool } from './tools/index.js';
import { closePool } from './db.js';

const PORT = 3000;
const API_KEY = process.env.OPEN_BRAIN_API_KEY;

// Initialize MCP Server
const server = new Server(
  {
    name: 'open-brain',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register list_tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
});

// Register call_tool handler
server.setRequestHandler(CallToolRequestSchema, async request => {
  const toolName = request.params.name;
  const toolInput = request.params.arguments;

  const tool = getTool(toolName);
  if (!tool) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            error: `Unknown tool: ${toolName}`,
          }),
        },
      ],
    };
  }

  try {
    const result = await tool.handler(toolInput);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            error: message,
          }),
        },
      ],
    };
  }
});

// Start MCP server with stdio transport
async function startMcpServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP Server] Connected via stdio transport');
}

// HTTP Server for external clients (with Bearer token auth)
function startHttpServer() {
  const app = express();
  app.use(express.json());

  // Bearer token middleware
  const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!API_KEY) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization' });
    }

    const token = authHeader.substring(7);
    if (token !== API_KEY) {
      return res.status(403).json({ error: 'Invalid API key' });
    }

    next();
  };

  // Health check endpoint (no auth)
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Standard MCP HTTP transport endpoint
  app.post('/mcp', authMiddleware, async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless - each request is independent
    });

    await server.connect(transport);
    await transport.handleRequest(req, res);
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.error(`[HTTP Server] Listening on port ${PORT}`);
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.error('[Server] Shutting down gracefully...');
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('[Server] Shutting down gracefully...');
  await closePool();
  process.exit(0);
});

// Start both servers
async function main() {
  console.error('[Server] Starting Open Brain MCP Server...');
  startMcpServer().catch(error => {
    console.error('[MCP Server Error]', error);
    process.exit(1);
  });

  startHttpServer();
}

main();
