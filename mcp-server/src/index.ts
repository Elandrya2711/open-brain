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
import { createOAuthRouter, verifyJwt } from './oauth.js';
import { initSSHKeys, getPublicKey, closeSSH } from './ssh.js';

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
  app.use(express.urlencoded({ extended: false }));

  // Mount OAuth routes (no auth required for these endpoints)
  if (API_KEY) {
    app.use(createOAuthRouter(API_KEY));
  }

  // Dual-auth middleware: accepts both static API key and OAuth JWT tokens
  const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!API_KEY) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Return 401 with WWW-Authenticate header for OAuth discovery
      const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
      const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'localhost:3000';
      const resourceMetadataUrl = `${proto}://${host}/.well-known/oauth-protected-resource`;
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadataUrl}"`);
      return res.status(401).json({ error: 'Missing or invalid authorization' });
    }

    const token = authHeader.substring(7);

    // Check 1: Direct API key (existing behavior, unchanged)
    if (token === API_KEY) {
      return next();
    }

    // Check 2: OAuth JWT token
    const payload = verifyJwt(token, API_KEY);
    if (payload) {
      return next();
    }

    return res.status(403).json({ error: 'Invalid API key or token' });
  };

  // Health check endpoint (no auth) — includes SSH public key for VM setup
  app.get('/health', (req, res) => {
    const publicKey = getPublicKey();
    res.json({
      status: 'ok',
      ...(publicKey && { sshPublicKey: publicKey }),
    });
  });

  // Auto-fix Accept header for StreamableHTTPServerTransport
  // This ensures Claude Code can connect without issues
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path === '/mcp') {
      const accept = req.headers.accept || '';
      // Ensure both types are present for MCP HTTP protocol
      if (!accept.includes('application/json') || !accept.includes('text/event-stream')) {
        console.error('[HTTP Server] Fixing Accept header for MCP. Original:', accept || 'empty');
        req.headers.accept = 'application/json, text/event-stream';
      }
    }
    next();
  });

  // MCP endpoint using StreamableHTTPServerTransport (supports Claude Code)
  app.all('/mcp', authMiddleware, async (req, res) => {
    try {
      console.error('[HTTP Server] MCP request:', {
        method: req.method,
        path: req.path,
        contentType: req.headers['content-type'],
      });

      // Create fresh Server instance
      const server = createMcpServer();
      registerToolHandlers(server);

      // Use StreamableHTTPServerTransport (now with fixed Accept header)
      const transport = new StreamableHTTPServerTransport();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[HTTP Server] MCP error:', message);
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
  await closeSSH();
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('[Server] Shutting down gracefully...');
  await closeSSH();
  await closePool();
  process.exit(0);
});

// Start both servers
async function main() {
  console.error('[Server] Starting Open Brain MCP Server...');

  // Initialize SSH keys (generates keypair on first run, loads from volume on subsequent runs)
  try {
    await initSSHKeys();
  } catch (error) {
    console.error('[Server] SSH key initialization failed (VM tools will not work):', error instanceof Error ? error.message : error);
  }

  startMcpServer().catch(error => {
    console.error('[MCP Server Error]', error);
    process.exit(1);
  });

  startHttpServer();
}

main();
