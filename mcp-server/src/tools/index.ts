// Auto-loader for all tool modules
import { tool as storeTool } from './brain/store.js';
import { tool as searchTool } from './brain/search.js';
import { tool as recentTool } from './brain/recent.js';
import { tool as statsTool } from './brain/stats.js';
import { tool as deleteTool } from './brain/delete.js';
import { tool as getSoulTool } from './soul/get_soul.js';
import { tool as syncSoulTool } from './soul/sync_soul.js';
// VM shell tools
import { tool as shellExecTool } from './vm/shell_exec.js';
import { tool as shellExecSudoTool } from './vm/shell_exec_sudo.js';
import { tool as fileReadTool } from './vm/file_read.js';
import { tool as fileWriteTool } from './vm/file_write.js';
import { tool as fileEditTool } from './vm/file_edit.js';
import { tool as fileGlobTool } from './vm/file_glob.js';
import { tool as fileGrepTool } from './vm/file_grep.js';
import { tool as serviceStatusTool } from './vm/service_status.js';
// OpenClaw tools
import { tool as openclawStatusTool } from './openclaw/status.js';
import { tool as openclawRestartTool } from './openclaw/restart.js';
import { tool as openclawLogsTool } from './openclaw/logs.js';
import { tool as openclawCronListTool } from './openclaw/cron_list.js';
import { tool as openclawCronRunTool } from './openclaw/cron_run.js';
import { tool as openclawUpdateTool } from './openclaw/update.js';

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
  getSoulTool as ToolDefinition,
  syncSoulTool as ToolDefinition,
  // VM shell tools
  shellExecTool as ToolDefinition,
  shellExecSudoTool as ToolDefinition,
  fileReadTool as ToolDefinition,
  fileWriteTool as ToolDefinition,
  fileEditTool as ToolDefinition,
  fileGlobTool as ToolDefinition,
  fileGrepTool as ToolDefinition,
  serviceStatusTool as ToolDefinition,
  // OpenClaw tools
  openclawStatusTool as ToolDefinition,
  openclawRestartTool as ToolDefinition,
  openclawLogsTool as ToolDefinition,
  openclawCronListTool as ToolDefinition,
  openclawCronRunTool as ToolDefinition,
  openclawUpdateTool as ToolDefinition,
];

export function getTool(name: string): ToolDefinition | undefined {
  return tools.find(t => t.name === name);
}

export function getToolsList(): ToolDefinition[] {
  return tools;
}
