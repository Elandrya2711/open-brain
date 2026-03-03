import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./db.js');
vi.mock('./embeddings.js');

import { getToolsList, getTool } from './tools/index.js';

describe('MCP Server', () => {
  describe('Tools Registration', () => {
    it('should have all 7 tools registered', () => {
      const tools = getToolsList();
      expect(tools).toHaveLength(7);
    });

    it('should have store_memory tool', () => {
      const tool = getTool('store_memory');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('store_memory');
      expect(tool?.description).toContain('knowledge');
    });

    it('should have semantic_search tool', () => {
      const tool = getTool('semantic_search');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('semantic_search');
    });

    it('should have list_recent tool', () => {
      const tool = getTool('list_recent');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('list_recent');
    });

    it('should have get_stats tool', () => {
      const tool = getTool('get_stats');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('get_stats');
    });

    it('should have delete_memory tool', () => {
      const tool = getTool('delete_memory');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('delete_memory');
    });

    it('should have get_soul tool', () => {
      const tool = getTool('get_soul');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('get_soul');
    });

    it('should have sync_soul tool', () => {
      const tool = getTool('sync_soul');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('sync_soul');
    });

    it('should return undefined for unknown tool', () => {
      const tool = getTool('nonexistent_tool');
      expect(tool).toBeUndefined();
    });
  });

  describe('Tool Schemas', () => {
    it('all tools should have valid inputSchema', () => {
      const tools = getToolsList();

      tools.forEach(tool => {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
      });
    });

    it('store_memory should require content', () => {
      const tool = getTool('store_memory');
      expect(tool?.inputSchema.required).toContain('content');
    });

    it('semantic_search should require query', () => {
      const tool = getTool('semantic_search');
      expect(tool?.inputSchema.required).toContain('query');
    });

    it('delete_memory should require id', () => {
      const tool = getTool('delete_memory');
      expect(tool?.inputSchema.required).toContain('id');
    });
  });

  describe('Tool Execution', () => {
    it('all tools should have handler functions', () => {
      const tools = getToolsList();

      tools.forEach(tool => {
        expect(typeof tool.handler).toBe('function');
      });
    });

    it('store_memory handler should be callable', async () => {
      const tool = getTool('store_memory');
      expect(tool?.handler).toBeDefined();

      const result = await tool!.handler({ content: 'test' });
      expect(result).toHaveProperty('success');
    });
  });
});
