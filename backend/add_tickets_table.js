const db = require('./config/db');

async function migrate() {
  console.log('⏳ Creating support_tickets table...');
  try {
    // Create Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(100) NOT NULL,
        email VARCHAR(255),
        topic VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ support_tickets table created successfully.');

    // Seed the user's specific ticket
    const checkQuery = await db.query('SELECT * FROM support_tickets WHERE email = $1 AND message = $2', ['mentorbravin@gmail.com', 'assdasdx']);
    if (checkQuery.rows.length === 0) {
      await db.query(`
        INSERT INTO support_tickets (name, phone, email, topic, message, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, ['bravin', '+2540758716026', 'mentorbravin@gmail.com', 'Leases/Billing', 'assdasdx', '2026-07-14T06:20:17.067Z']);
      console.log('✅ Seeded support ticket for: mentorbravin@gmail.com');
    } else {
      console.log('ℹ️ Support ticket already exists.');
    }

    console.log('🎉 Migration completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
