const db = require('./config/db');

async function runMigration() {
  console.log('⏳ Running migration to add Paybill columns to mpesa_transactions...');
  try {
    await db.query(`
      ALTER TABLE mpesa_transactions 
      ADD COLUMN IF NOT EXISTS mpesa_code VARCHAR(100),
      ADD COLUMN IF NOT EXISTS mpesa_message TEXT,
      ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'STK_PUSH';
    `);
    console.log('✅ Columns mpesa_code, mpesa_message, and payment_method successfully added/verified.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

runMigration();
