import { execCommand } from '../../ssh.js';

const JOB_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

export const tool = {
  name: 'openclaw_cron_run',
  description: 'Manually trigger an OpenClaw cron job',
  inputSchema: {
    type: 'object' as const,
    properties: {
      job_id: {
        type: 'string',
        description: 'The cron job identifier to trigger',
      },
    },
    required: ['job_id'],
  },
  handler: async (input: { job_id?: string }) => {
    console.error('[openclaw_cron_run] Handler called with:', { job_id: input.job_id });

    if (!input.job_id || typeof input.job_id !== 'string') {
      return { success: false, error: 'Job ID is required and must be a string' };
    }

    if (!JOB_ID_REGEX.test(input.job_id)) {
      return {
        success: false,
        error: 'Invalid job ID. Only alphanumeric characters, hyphens, and underscores are allowed.',
      };
    }

    try {
      const result = await execCommand(
        `openclaw cron run ${input.job_id} 2>&1`,
        { timeout: 120000 }
      );

      return {
        success: result.exitCode === 0,
        job_id: input.job_id,
        output: result.stdout.trim(),
        exit_code: result.exitCode,
        ...(result.exitCode !== 0 && { error: result.stderr.trim() || result.stdout.trim() }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[openclaw_cron_run] Error:', message);
      return { success: false, error: `Failed to run cron job: ${message}` };
    }
  },
};
