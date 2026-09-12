const db = require('./config/db');

async function migrateMachines() {
  try {
    console.log('🔄 Creating machines table if not exists...');
    
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
    
    console.log('✅ machines table created successfully.');

    // Check if table is empty
    const check = await db.query('SELECT COUNT(*) FROM machines');
    const count = parseInt(check.rows[0].count);

    if (count === 0) {
      console.log('🌱 Seeding 10 default mining machines...');
      
      const defaultMachines = [
        {
          slug: 'starter-miner-v1',
          name: 'Starter Miner V1',
          tagline: 'Ideal for beginners & fast daily returns',
          price: 3000.00,
          daily_income: 150.00,
          duration_days: 30,
          total_profit: 4500.00,
          speed: '25 MH/s',
          slots_total: 100,
          slots_taken: 88,
          badge: '⚡ POPULAR',
          image: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=800&q=80',
          status: 'Active',
          sort_order: 1
        },
        {
          slug: 'bronze-daily-miner',
          name: 'Bronze Daily Miner',
          tagline: 'Steady daily growth with proven reliability',
          price: 8500.00,
          daily_income: 450.00,
          duration_days: 30,
          total_profit: 13500.00,
          speed: '65 MH/s',
          slots_total: 100,
          slots_taken: 92,
          badge: '⚡ FAST PAYOUT',
          image: 'https://images.unsplash.com/photo-1597852074816-d933c7d2b988?auto=format&fit=crop&w=800&q=80',
          status: 'Active',
          sort_order: 2
        },
        {
          slug: 'silver-profit-miner',
          name: 'Silver Profit Miner',
          tagline: 'High-speed dual-fan optimized hash unit',
          price: 15000.00,
          daily_income: 825.00,
          duration_days: 30,
          total_profit: 24750.00,
          speed: '120 MH/s',
          slots_total: 50,
          slots_taken: 41,
          badge: '🔥 HIGH DEMAND',
          image: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=800&q=80',
          status: 'Active',
          sort_order: 3
        },
        {
          slug: 'gold-power-miner',
          name: 'Gold Power Miner',
          tagline: 'Heavy-duty multi-fan rig for maximum efficiency',
          price: 30000.00,
          daily_income: 1750.00,
          duration_days: 30,
          total_profit: 52500.00,
          speed: '240 MH/s',
          slots_total: 40,
          slots_taken: 36,
          badge: '⭐ TOP RATED',
          image: 'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?auto=format&fit=crop&w=800&q=80',
          status: 'Active',
          sort_order: 4
        },
        {
          slug: 'platinum-super-miner',
          name: 'Platinum Super Miner',
          tagline: 'High-performance commercial mining system',
          price: 65000.00,
          daily_income: 4000.00,
          duration_days: 30,
          total_profit: 120000.00,
          speed: '520 MH/s',
          slots_total: 30,
          slots_taken: 27,
          badge: '⚡ HIGH YIELD',
          image: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=800&q=80',
          status: 'Active',
          sort_order: 5
        },
        {
          slug: 'diamond-pro-miner',
          name: 'Diamond Pro Miner',
          tagline: 'Industrial-grade continuous power rig',
          price: 120000.00,
          daily_income: 7800.00,
          duration_days: 30,
          total_profit: 234000.00,
          speed: '1,050 MH/s',
          slots_total: 20,
          slots_taken: 18,
          badge: '💎 PRO LEVEL',
          image: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=800&q=80',
          status: 'Active',
          sort_order: 6
        },
        {
          slug: 'emerald-master-miner',
          name: 'Emerald Master Miner',
          tagline: 'Liquid-cooled enterprise mining rack',
          price: 250000.00,
          daily_income: 17000.00,
          duration_days: 30,
          total_profit: 510000.00,
          speed: '2,200 MH/s',
          slots_total: 15,
          slots_taken: 13,
          badge: '🚀 SUPERIOR',
          image: 'https://images.unsplash.com/photo-1563770660941-20978e870e26?auto=format&fit=crop&w=800&q=80',
          status: 'Active',
          sort_order: 7
        },
        {
          slug: 'ruby-ultra-miner',
          name: 'Ruby Ultra Miner',
          tagline: 'Ultra-fast multi-chassis mining mainframe',
          price: 500000.00,
          daily_income: 36000.00,
          duration_days: 30,
          total_profit: 1080000.00,
          speed: '4,800 MH/s',
          slots_total: 10,
          slots_taken: 9,
          badge: '🔥 ULTRA SPEED',
          image: 'https://images.unsplash.com/photo-1629654297299-c8506221ca97?auto=format&fit=crop&w=800&q=80',
          status: 'Active',
          sort_order: 8
        },
        {
          slug: 'sapphire-giant-miner',
          name: 'Sapphire Giant Miner',
          tagline: 'Commercial server-room level mining cluster',
          price: 1000000.00,
          daily_income: 75000.00,
          duration_days: 30,
          total_profit: 2250000.00,
          speed: '10.5 GH/s',
          slots_total: 5,
          slots_taken: 4,
          badge: '⚡ MASSIVE YIELD',
          image: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=800&q=80',
          status: 'Active',
          sort_order: 9
        },
        {
          slug: 'crown-vip-titan-miner',
          name: 'Crown VIP Titan Miner',
          tagline: 'Hyperscale institutional mining power plant',
          price: 2500000.00,
          daily_income: 200000.00,
          duration_days: 30,
          total_profit: 6000000.00,
          speed: '28.0 GH/s',
          slots_total: 3,
          slots_taken: 2,
          badge: '👑 VIP EXCLUSIVE',
          image: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=800&q=80',
          status: 'Active',
          sort_order: 10
        }
      ];

      for (const m of defaultMachines) {
        await db.query(`
          INSERT INTO machines (
            slug, name, tagline, price, daily_income, duration_days, total_profit, 
            speed, slots_total, slots_taken, badge, image, status, sort_order
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (slug) DO NOTHING
        `, [
          m.slug, m.name, m.tagline, m.price, m.daily_income, m.duration_days, m.total_profit,
          m.speed, m.slots_total, m.slots_taken, m.badge, m.image, m.status, m.sort_order
        ]);
      }
      
      console.log('✅ Seeded 10 default mining machines successfully.');
    } else {
      console.log(`ℹ️ machines table already has ${count} records. No seed required.`);
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

migrateMachines();
