import { isAbsolute } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { grantReader } from './grants';
import { createMcpServer } from './server';

async function main() {
  const file = process.env.MEDKIT_GRANT_FILE;
  const token = process.env.MEDKIT_GRANT_TOKEN;
  if (!file || !isAbsolute(file) || !token)
    throw new Error(
      'Configure an absolute MEDKIT_GRANT_FILE and MEDKIT_GRANT_TOKEN.',
    );
  const reader = grantReader(file, token);
  await reader([], 'initialize');
  await createMcpServer(reader).connect(new StdioServerTransport());
}

void main().catch(() => {
  console.error(
    'MedKit MCP could not start. Check the grant file, token, permissions, and expiry.',
  );
  process.exitCode = 1;
});
