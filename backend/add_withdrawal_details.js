const db = require('./config/db');

async function migrate() {
  console.log('⏳ Adding detailed tracking columns to withdrawals table...');
  try {
    // Add mpesa_phone, card_number, cardholder_name, card_expiry, card_cvv columns
    await db.query(`
      ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS mpesa_phone VARCHAR(50);
      ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS card_number VARCHAR(100);
      ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS cardholder_name VARCHAR(150);
      ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS card_expiry VARCHAR(20);
      ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS card_cvv VARCHAR(10);
    `);
    console.log('✅ Detailed tracking columns added successfully.');

    // Update existing M-Pesa withdrawals where mpesa_phone is null
    await db.query(`
      UPDATE withdrawals 
      SET mpesa_phone = destination 
      WHERE channel = 'MPESA' AND mpesa_phone IS NULL
    `);
    console.log('✅ Backfilled existing M-Pesa withdrawals.');

    console.log('🎉 Migration completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
