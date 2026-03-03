import { execCommand } from '../../ssh.js';

const SERVICE_NAME_REGEX = /^[a-zA-Z0-9_@.\-]+$/;

export const tool = {
  name: 'service_status',
  description: 'Get systemd service status and recent log lines from the VM',
  inputSchema: {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description: 'Systemd service name (e.g., "nginx", "sshd")',
      },
    },
    required: ['name'],
  },
  handler: async (input: { name?: string }) => {
    console.error('[service_status] Handler called with:', { name: input.name });

    if (!input.name || typeof input.name !== 'string') {
      return { success: false, error: 'Service name is required and must be a string' };
    }

    if (!SERVICE_NAME_REGEX.test(input.name)) {
      return {
        success: false,
        error: 'Invalid service name. Only alphanumeric characters, hyphens, underscores, dots, and @ are allowed.',
      };
    }

    try {
      const result = await execCommand(
        `systemctl status ${input.name} 2>&1; echo "---JOURNAL---"; journalctl -u ${input.name} -n 20 --no-pager 2>&1`
      );

      const output = result.stdout;
      const separator = '---JOURNAL---';
      const sepIndex = output.indexOf(separator);

      let status: string;
      let logs: string;

      if (sepIndex !== -1) {
        status = output.substring(0, sepIndex).trim();
        logs = output.substring(sepIndex + separator.length).trim();
      } else {
        status = output.trim();
        logs = '';
      }

      return {
        success: true,
        service: input.name,
        status,
        logs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[service_status] Error:', message);
      return { success: false, error: `Failed to get service status: ${message}` };
    }
  },
};
