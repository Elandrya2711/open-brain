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

  // Direct MCP request handler (bypasses StreamableHTTPServerTransport header validation)
  // Handles JSON-RPC 2.0 requests directly
  app.post('/mcp', authMiddleware, async (req, res) => {
    try {
      console.error('[HTTP Server] Direct MCP request received:', {
        method: req.method,
        rpcMethod: req.body?.method,
        toolName: req.body?.params?.name,
      });

      // Parse the JSON-RPC request
      const body = req.body;
      if (!body || !body.method) {
        return res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32700, message: 'Parse error' },
          id: body?.id || null,
        });
      }

      // Create a fresh Server instance per request
      const server = createMcpServer();
      registerToolHandlers(server);

      // Direct handler for tools/call without transport layer validation
      if (body.method === 'tools/call') {
        const tool = getTool(body.params?.name);
        if (!tool) {
          return res.json({
            jsonrpc: '2.0',
            error: {
              code: -32601,
              message: `Unknown tool: ${body.params?.name}`,
            },
            id: body.id,
          });
        }

        try {
          console.error('[HTTP Server] Calling tool:', body.params.name, 'with input:', body.params.arguments);
          const result = await tool.handler(body.params.arguments || {});
          console.error('[HTTP Server] Tool result:', result);

          res.json({
            jsonrpc: '2.0',
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            },
            id: body.id,
          });
        } catch (toolError) {
          const message = toolError instanceof Error ? toolError.message : 'Unknown error';
          console.error('[HTTP Server] Tool error:', message);
          res.json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: message,
            },
            id: body.id,
          });
        }
        return;
      }

      // Handle other MCP methods using the standard request/response
      if (body.method === 'tools/list') {
        return res.json({
          jsonrpc: '2.0',
          result: {
            tools: tools.map(tool => ({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema,
            })),
          },
          id: body.id,
        });
      }

      // Unsupported method
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32601, message: 'Method not found' },
        id: body.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[HTTP Server] Error handling MCP request:', message, error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32000, message },
          id: req.body?.id || null,
        });
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
