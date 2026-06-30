import 'reflect-metadata';
import { AppDataSource } from './data-source';
import { runSeed } from './seed.runner';

/** CLI entrypoint: `npm run db:seed`. Initializes the standalone DataSource then seeds. */
async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    await runSeed(AppDataSource);
    console.log('✅ Seed complete.');
    console.log('   System Admin: admin@amoeba.group / amb2026!@');
    console.log('   Tenant Master (ivyusa): dev@amoeba.group / amb2026!@');
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
