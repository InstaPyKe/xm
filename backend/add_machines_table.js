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
        slug: 'gold-power-miner',
        name: 'Gold Power Miner',
        tagline: 'Heavy-duty multi-fan rig for maximum monthly yield',
        price: 10000.00,
        daily_income: 820.00,
        duration_days: 30,
        total_profit: 24600.00,
        speed: '280 MH/s',
        slots_total: 80,
        slots_taken: 63,
        badge: '⭐ TOP RATED',
        image: 'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?auto=format&fit=crop&w=800&q=80',
        status: 'Active',
        sort_order: 4
      },
      {
        slug: 'platinum-super-miner',
        name: 'Platinum Super Miner',
        tagline: 'Commercial mining system with accelerated 25-day cycle',
        price: 25000.00,
        daily_income: 2250.00,
        duration_days: 25,
        total_profit: 56250.00,
        speed: '650 MH/s',
        slots_total: 60,
        slots_taken: 47,
        badge: '⚡ FAST CYCLE',
        image: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=800&q=80',
        status: 'Active',
        sort_order: 5
      },
      {
        slug: 'diamond-pro-miner',
        name: 'Diamond Pro Miner',
        tagline: 'Industrial-grade rig with rapid 21-day maturity',
        price: 60000.00,
        daily_income: 6000.00,
        duration_days: 21,
        total_profit: 126000.00,
        speed: '1.5 GH/s',
        slots_total: 40,
        slots_taken: 32,
        badge: '💎 PRO LEVEL',
        image: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=800&q=80',
        status: 'Active',
        sort_order: 6
      },
      {
        slug: 'emerald-master-miner',
        name: 'Emerald Master Miner',
        tagline: 'Liquid-cooled enterprise rack with 18-day turnaround',
        price: 150000.00,
        daily_income: 16500.00,
        duration_days: 18,
        total_profit: 297000.00,
        speed: '3.6 GH/s',
        slots_total: 25,
        slots_taken: 19,
        badge: '🚀 ENTERPRISE',
        image: 'https://images.unsplash.com/photo-1563770660941-20978e870e26?auto=format&fit=crop&w=800&q=80',
        status: 'Active',
        sort_order: 7
      },
      {
        slug: 'ruby-ultra-miner',
        name: 'Ruby Ultra Miner',
        tagline: 'High-power mainframe with ultra-fast 2-week maturity',
        price: 350000.00,
        daily_income: 42000.00,
        duration_days: 14,
        total_profit: 588000.00,
        speed: '8.5 GH/s',
        slots_total: 15,
        slots_taken: 11,
        badge: '🔥 2-WEEK MATURITY',
        image: 'https://images.unsplash.com/photo-1629654297299-c8506221ca97?auto=format&fit=crop&w=800&q=80',
        status: 'Active',
        sort_order: 8
      },
      {
        slug: 'sapphire-giant-miner',
        name: 'Sapphire Giant Miner',
        tagline: 'Commercial server cluster yielding massive 14-day income',
        price: 800000.00,
        daily_income: 105000.00,
        duration_days: 14,
        total_profit: 1470000.00,
        speed: '18.0 GH/s',
        slots_total: 10,
        slots_taken: 7,
        badge: '⚡ 14-DAY RAPID',
        image: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=800&q=80',
        status: 'Active',
        sort_order: 9
      },
      {
        slug: 'crown-vip-titan-miner',
        name: 'Crown VIP Titan Miner',
        tagline: 'Hyperscale institutional power plant — elite 2-week payout',
        price: 2000000.00,
        daily_income: 280000.00,
        duration_days: 14,
        total_profit: 3920000.00,
        speed: '45.0 GH/s',
        slots_total: 5,
        slots_taken: 3,
        badge: '👑 14-DAY VIP TITAN',
        image: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=800&q=80',
        status: 'Active',
        sort_order: 10
      }
    ];

    console.log('🌱 Upserting all 10 mining machines with 500 KSh minimum and 1-month to 2-week tiered maturity...');
    
    for (const m of defaultMachines) {
      await db.query(`
        INSERT INTO machines (
          slug, name, tagline, price, daily_income, duration_days, total_profit, 
          speed, slots_total, slots_taken, badge, image, status, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (slug) DO UPDATE SET
          name = EXCLUDED.name,
          tagline = EXCLUDED.tagline,
          price = EXCLUDED.price,
          daily_income = EXCLUDED.daily_income,
          duration_days = EXCLUDED.duration_days,
          total_profit = EXCLUDED.total_profit,
          speed = EXCLUDED.speed,
          slots_total = EXCLUDED.slots_total,
          slots_taken = EXCLUDED.slots_taken,
          badge = EXCLUDED.badge,
          image = EXCLUDED.image,
          status = EXCLUDED.status,
          sort_order = EXCLUDED.sort_order,
          updated_at = CURRENT_TIMESTAMP
      `, [
        m.slug, m.name, m.tagline, m.price, m.daily_income, m.duration_days, m.total_profit,
        m.speed, m.slots_total, m.slots_taken, m.badge, m.image, m.status, m.sort_order
      ]);
    }
    
    console.log('✅ Successfully seeded and synchronized 10 mining machines.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

migrateMachines();
