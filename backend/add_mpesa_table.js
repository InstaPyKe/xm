const db = require('./config/db');

async function migrate() {
  console.log('⏳ Creating mpesa_transactions table...');
  try {
    // Create Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS mpesa_transactions (
        id SERIAL PRIMARY KEY,
        checkout_request_id VARCHAR(100) UNIQUE NOT NULL,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        amount NUMERIC(15, 2) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'Pending', -- 'Pending', 'Completed', 'Failed'
        tier VARCHAR(100) NOT NULL,
        name VARCHAR(150) NOT NULL,
        type VARCHAR(50) NOT NULL,
        speed VARCHAR(50) NOT NULL,
        duration INT NOT NULL,
        cost NUMERIC(15, 2) NOT NULL,
        rate NUMERIC(5, 2) NOT NULL,
        daily_earnings NUMERIC(15, 2) NOT NULL,
        image VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ mpesa_transactions table created successfully.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
