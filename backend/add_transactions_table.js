const db = require('./config/db');

async function migrate() {
  console.log('⏳ Creating rent_transactions table...');
  try {
    // Create Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS rent_transactions (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        lease_id INT REFERENCES leases(id) ON DELETE CASCADE,
        node_id VARCHAR(50) NOT NULL,
        machine_name VARCHAR(150) NOT NULL,
        amount NUMERIC(15, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ rent_transactions table created successfully.');

    // Backfill from existing leases
    const leasesRes = await db.query('SELECT * FROM leases');
    for (const lease of leasesRes.rows) {
      const existRes = await db.query('SELECT id FROM rent_transactions WHERE lease_id = $1', [lease.id]);
      if (existRes.rows.length === 0) {
        await db.query(`
          INSERT INTO rent_transactions (user_id, lease_id, node_id, machine_name, amount, created_at)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [lease.user_id, lease.id, lease.node_id, lease.name, lease.cost, lease.created_at]);
      }
    }
    console.log('✅ Backfilled existing leases into rent_transactions table.');

    console.log('🎉 Migration completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
