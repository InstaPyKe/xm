const db = require('./config/db');

async function runMigration() {
  console.log('⏳ Starting email authentication database migration...');
  try {
    // 1. Add email column if it doesn't exist
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
    `);
    console.log('✅ Added "email" column (VARCHAR UNIQUE) to users table.');

    // 2. Drop the NOT NULL constraint on phone number
    await db.query(`
      ALTER TABLE users 
      ALTER COLUMN phone DROP NOT NULL;
    `);
    console.log('✅ Dropped NOT NULL constraint on "phone" column.');

    // 3. Update the seed user bravin_miner (ID 1) with a default email
    await db.query(`
      UPDATE users 
      SET email = 'bravin@xmdigitalproducts.com' 
      WHERE id = 1 AND email IS NULL;
    `);
    console.log('✅ Seeded default user "bravin_miner" with email: bravin@xmdigitalproducts.com');

    console.log('🎉 Database migration completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

runMigration();
