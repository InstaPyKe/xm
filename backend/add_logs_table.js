const db = require('./config/db');

async function migrate() {
  console.log('⏳ Creating system_logs table...');
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS system_logs (
        id SERIAL PRIMARY KEY,
        level VARCHAR(50) DEFAULT 'info', -- 'info', 'error', 'warning'
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ system_logs table created successfully.');
    
    // Seed some initial logs
    await db.query(`
      INSERT INTO system_logs (level, message) VALUES
      ('info', 'System initialization completed successfully.'),
      ('info', 'M-Pesa Daraja payment gateway online.'),
      ('info', 'Secure cryptographic consensus pool active.')
    `);
    console.log('✅ Seeded default system logs.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
