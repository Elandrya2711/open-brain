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
  handler: (input: any) => Promise<any>;
}

export const tools: ToolDefinition[] = [
  storeTool as ToolDefinition,
  searchTool as ToolDefinition,
  recentTool as ToolDefinition,
  statsTool as ToolDefinition,
  deleteTool as ToolDefinition,
];

export function getTool(name: string): ToolDefinition | undefined {
  return tools.find(t => t.name === name);
}

export function getToolsList(): ToolDefinition[] {
  return tools;
}
