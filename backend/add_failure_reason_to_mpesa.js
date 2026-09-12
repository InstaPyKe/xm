const db = require('./config/db');

async function run() {
  try {
    await db.query('ALTER TABLE mpesa_transactions ADD COLUMN IF NOT EXISTS failure_reason VARCHAR(255)');
    console.log('✅ Column failure_reason added to mpesa_transactions table');
    process.exit(0);
  } catch (e) {
    console.error('❌ Alter table failed:', e.message);
    process.exit(1);
  }
}

run();
