// The client test platform: `npm run clients` (or `node clients.js`).
// Just Social Justice Radio and Strategic AI at Actua, in data-clients/,
// so it never mixes with the six-org platform in data/. Works the same on
// Windows, macOS and Linux (no shell variables in package.json).
process.env.TEST_PLATFORM = 'clients';
// Its own folder, even if .env sets DATA_DIR for the main platform.
process.env.DATA_DIR = process.env.CLIENTS_DATA_DIR || 'data-clients';
process.env.SEED_EXAMPLES = 'true';

const { start } = await import('./server/index.js');
start().catch((err) => {
  console.error(err);
  process.exit(1);
});
