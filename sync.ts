import { runSync } from './sync-core.ts';

if (!process.env.VERIFONE_USER_UUID || !process.env.VERIFONE_API_KEY) {
  console.error('Error: VERIFONE_USER_UUID and VERIFONE_API_KEY must be set in .env');
  process.exit(1);
}

try {
  console.log('Starting transaction sync...\n');
  const result = await runSync();
  console.log(`\nTotal: ${result.inserted} new rows inserted, ${result.skipped} duplicates skipped`);
  console.log(`Next run will start from: ${result.nextSync}`);
} catch (err) {
  console.error('Sync failed:', err);
  process.exit(1);
}
