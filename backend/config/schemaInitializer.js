const db = require('./db');

/**
 * Automatically provisions all PostgreSQL tables, schemas, indexes,
 * and initial seed data on server startup.
 */
async function initializeDatabase() {
  try {
    console.log('🔄 Checking and initializing PostgreSQL database schema...');

    // 1. Users Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE,
        phone VARCHAR(50) UNIQUE,
        password VARCHAR(255) NOT NULL,
        referral VARCHAR(100),
        balance NUMERIC(15, 2) DEFAULT 0.00,
        leased_earnings NUMERIC(15, 2) DEFAULT 0.00,
        daily_growth NUMERIC(15, 2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure email column exists (migration helper)
    await db.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
      ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;
    `);

    // 2. Leases Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS leases (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        node_id VARCHAR(50) NOT NULL,
        name VARCHAR(150) NOT NULL,
        type VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'Hashing',
        speed VARCHAR(50) NOT NULL,
        duration INT NOT NULL DEFAULT 30,
        remaining INT NOT NULL DEFAULT 30,
        cost NUMERIC(15, 2) NOT NULL,
        rate NUMERIC(5, 2) NOT NULL DEFAULT 7.0,
        daily_earnings NUMERIC(15, 2) NOT NULL DEFAULT 35.0,
        image VARCHAR(500),
        last_yield_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Yield History Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS yield_history (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        amount NUMERIC(15, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Withdrawals Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        reference VARCHAR(100) UNIQUE NOT NULL,
        amount NUMERIC(15, 2) NOT NULL,
        fee NUMERIC(15, 2) NOT NULL,
        channel VARCHAR(100) NOT NULL,
        destination VARCHAR(255) NOT NULL,
        account_name VARCHAR(255),
        status VARCHAR(50) NOT NULL DEFAULT 'Success',
        failure_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure account_name and failure_reason exist in withdrawals
    await db.query(`
      ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS account_name VARCHAR(255);
      ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS failure_reason TEXT;
    `);

    // 5. MPESA Transactions Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS mpesa_transactions (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE SET NULL,
        checkout_request_id VARCHAR(100) UNIQUE NOT NULL,
        merchant_request_id VARCHAR(100),
        phone VARCHAR(50) NOT NULL,
        amount NUMERIC(15, 2) NOT NULL,
        machine_id INT,
        status VARCHAR(50) NOT NULL DEFAULT 'Pending',
        mpesa_receipt_number VARCHAR(100),
        transaction_date VARCHAR(100),
        failure_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      ALTER TABLE mpesa_transactions ADD COLUMN IF NOT EXISTS failure_reason TEXT;
    `);

    // 6. Machines Catalog Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS machines (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(150) NOT NULL,
        tagline VARCHAR(255) DEFAULT '',
        price NUMERIC(15, 2) NOT NULL,
        daily_income NUMERIC(15, 2) NOT NULL,
        duration_days INT NOT NULL DEFAULT 30,
        total_profit NUMERIC(15, 2) NOT NULL,
        speed VARCHAR(50) DEFAULT '25 MH/s',
        slots_total INT DEFAULT 100,
        slots_taken INT DEFAULT 0,
        badge VARCHAR(50) DEFAULT '',
        image VARCHAR(500) NOT NULL,
        status VARCHAR(50) DEFAULT 'Active',
        sort_order INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 7. Support Tickets Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(100) NOT NULL,
        email VARCHAR(255),
        topic VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'Open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 8. System Logs Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS system_logs (
        id SERIAL PRIMARY KEY,
        level VARCHAR(20) NOT NULL DEFAULT 'INFO',
        category VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
        message TEXT NOT NULL,
        metadata JSONB,
        ip_address VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 9. Rent Transactions Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS rent_transactions (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        lease_id INT,
        node_id VARCHAR(50) NOT NULL,
        machine_name VARCHAR(150) NOT NULL,
        amount NUMERIC(15, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 10. Seed Default Machine Catalog if empty
    const machineCheck = await db.query('SELECT COUNT(*) AS count FROM machines');
    if (parseInt(machineCheck.rows[0].count, 10) === 0) {
      console.log('🌱 Seeding default machine catalog (500 KSh minimum, 30d to 14d tiered maturity)...');
      const defaultMachines = [
        {
          slug: 'starter-miner-v1',
          name: 'Starter Miner V1',
          tagline: 'Entry miner for beginners — 1-month steady daily returns',
          price: 500.00,
          daily_income: 35.00,
          duration_days: 30,
          total_profit: 1050.00,
          speed: '15 MH/s',
          slots_total: 200,
          slots_taken: 164,
          badge: '⚡ 500 ENTRY',
          image: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=800&q=80',
          status: 'Active',
          sort_order: 1
        },
        {
          slug: 'bronze-daily-miner',
          name: 'Bronze Daily Miner',
          tagline: 'Affordable daily growth with proven reliability',
          price: 1500.00,
          daily_income: 110.00,
          duration_days: 30,
          total_profit: 3300.00,
          speed: '45 MH/s',
          slots_total: 150,
          slots_taken: 118,
          badge: '⚡ POPULAR',
          image: 'https://images.unsplash.com/photo-1591488320449-011701bb6704?auto=format&fit=crop&w=800&q=80',
          status: 'Active',
          sort_order: 2
        },
        {
          slug: 'silver-profit-miner',
          name: 'Silver Profit Miner',
          tagline: 'High-efficiency dual-fan optimized hash unit',
          price: 4000.00,
          daily_income: 310.00,
          duration_days: 30,
          total_profit: 9300.00,
          speed: '110 MH/s',
          slots_total: 100,
          slots_taken: 72,
          badge: '🔥 BEST VALUE',
          image: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=800&q=80',
          status: 'Active',
          sort_order: 3
        },
        {
          slug: 'gold-turbo-miner',
          name: 'Gold Turbo Miner',
          tagline: 'Balanced medium-tier workhorse with accelerated 21-day yield',
          price: 10000.00,
          daily_income: 820.00,
          duration_days: 21,
          total_profit: 17220.00,
          speed: '280 MH/s',
          slots_total: 80,
          slots_taken: 54,
          badge: '⭐ FAST 21-DAY',
          image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80',
          status: 'Active',
          sort_order: 4
        },
        {
          slug: 'platinum-matrix-rig',
          name: 'Platinum Matrix Rig',
          tagline: 'Commercial-grade liquid-cooled multi-GPU architecture',
          price: 25000.00,
          daily_income: 2200.00,
          duration_days: 21,
          total_profit: 46200.00,
          speed: '720 MH/s',
          slots_total: 60,
          slots_taken: 39,
          badge: '💎 TOP YIELD',
          image: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=800&q=80',
          status: 'Active',
          sort_order: 5
        },
        {
          slug: 'titan-enterprise-node',
          name: 'Titan Enterprise Node',
          tagline: 'Ultra high-speed ASIC cluster with rapid 14-day turnaround',
          price: 60000.00,
          daily_income: 5700.00,
          duration_days: 14,
          total_profit: 79800.00,
          speed: '1.85 GH/s',
          slots_total: 40,
          slots_taken: 26,
          badge: '🚀 RAPID 14-DAY',
          image: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=800&q=80',
          status: 'Active',
          sort_order: 6
        },
        {
          slug: 'quantum-apex-mainframe',
          name: 'Quantum Apex Mainframe',
          tagline: 'Institutional quantum-grade hashing cluster with highest daily payout',
          price: 150000.00,
          daily_income: 15500.00,
          duration_days: 14,
          total_profit: 217000.00,
          speed: '5.20 GH/s',
          slots_total: 20,
          slots_taken: 11,
          badge: '👑 ULTRA 14-DAY',
          image: 'https://images.unsplash.com/photo-1563770660941-20978e870e26?auto=format&fit=crop&w=800&q=80',
          status: 'Active',
          sort_order: 7
        }
      ];

      for (const m of defaultMachines) {
        await db.query(`
          INSERT INTO machines (slug, name, tagline, price, daily_income, duration_days, total_profit, speed, slots_total, slots_taken, badge, image, status, sort_order)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (slug) DO NOTHING
        `, [m.slug, m.name, m.tagline, m.price, m.daily_income, m.duration_days, m.total_profit, m.speed, m.slots_total, m.slots_taken, m.badge, m.image, m.status, m.sort_order]);
      }
      console.log('✅ Default machine catalog seeded.');
    }

    // 11. Seed default user if no users exist
    const userCount = await db.query('SELECT COUNT(*) AS count FROM users');
    if (parseInt(userCount.rows[0].count, 10) === 0) {
      console.log('🌱 Seeding demo user "bravin_miner" (password: bravin123)...');
      await db.query(`
        INSERT INTO users (id, username, email, phone, password, referral, balance, leased_earnings, daily_growth)
        VALUES (
          1, 
          'bravin_miner', 
          'bravin@xmdigitalproducts.com',
          '+254700000000', 
          '$2a$10$wE8wY01YfM/vBqD.hE6ZFeUqA6H5oZlpxG0lT7y2Kz2J44C2bFRe.', 
          'XM-STARTER-REF', 
          192783.50, 
          405652.00, 
          5863.00
        ) ON CONFLICT DO NOTHING;
      `);
      await db.query("SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id), 1) FROM users));");
      console.log('✅ Demo user seeded.');
    }

    console.log('🎉 PostgreSQL Database Schema is fully verified and ready.');
  } catch (err) {
    console.error('⚠️ Database schema initialization warning:', err.message);
  }
}

module.exports = { initializeDatabase };
