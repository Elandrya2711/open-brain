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

// Shared handler registration for any Server instance
function registerToolHandlers(server: Server) {
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  });

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
}

function createMcpServer(): Server {
  return new Server(
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
}

// Start MCP server with stdio transport
async function startMcpServer() {
  const server = createMcpServer();
  registerToolHandlers(server);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP Server] Connected via stdio transport');
}

// HTTP Server for external clients (with Bearer token auth)
// Stateless: each request gets a fresh Server + Transport instance
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

  // Standard MCP HTTP transport endpoint (stateless, fresh instance per request)
  app.all('/mcp', authMiddleware, async (req, res) => {
    try {
      // Fresh instance per request: create Server + Transport pair
      const server = createMcpServer();
      registerToolHandlers(server);

      // Stateless mode: no sessionIdGenerator, no session tracking
      const transport = new StreamableHTTPServerTransport();

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[HTTP Server] Error handling MCP request:', message);
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      }
    }
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
