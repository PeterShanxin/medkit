import { parseArgs } from 'node:util';
import { productionConfig, wrangler } from './commands';

const { values } = parseArgs({
  options: { config: { type: 'string' } },
  strict: true,
});
if (!values.config)
  throw new Error('Pass --config with your private production configuration.');
const config = productionConfig(values.config);
// Migrations are additive and versioned. This command never upgrades an account plan.
wrangler(['d1', 'migrations', 'apply', 'DB', '--remote', '--config', config]);
wrangler(['deploy', '--config', config]);
