// Auto-loader for all tool modules
import { tool as storeTool } from './brain/store.js';
import { tool as searchTool } from './brain/search.js';
import { tool as recentTool } from './brain/recent.js';
import { tool as statsTool } from './brain/stats.js';
import { tool as deleteTool } from './brain/delete.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (input: unknown) => Promise<unknown>;
}

export const tools: ToolDefinition[] = [
  storeTool,
  searchTool,
  recentTool,
  statsTool,
  deleteTool,
];

export function getTool(name: string): ToolDefinition | undefined {
  return tools.find(t => t.name === name);
}

export function getToolsList(): ToolDefinition[] {
  return tools;
}
