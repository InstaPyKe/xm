const db = require('./config/db');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_xm_key_109283';
const adminToken = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });

async function runTests() {
  console.log('🧪 Starting Machine Catalog CRUD Tests...\n');

  // Test 1: Fetch all machines from DB
  const list = await db.query('SELECT * FROM machines ORDER BY sort_order ASC');
  console.log(`✅ [Test 1] Found ${list.rows.length} machines in database.`);
  if (list.rows.length === 0) {
    console.error('❌ Expected at least 10 machines.');
    process.exit(1);
  }

  // Test 2: Insert new machine
  const testSlug = 'test-titan-rig-' + Date.now();
  const insertRes = await db.query(`
    INSERT INTO machines (
      slug, name, tagline, price, daily_income, duration_days, total_profit,
      speed, slots_total, slots_taken, badge, image, status, sort_order
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *
  `, [
    testSlug, 'Test Titan Rig', 'Special high performance test rig',
    45000, 3000, 30, 90000, '350 MH/s', 20, 5, '🔥 TEST',
    'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=800&q=80',
    'Active', 99
  ]);

  const createdId = insertRes.rows[0].id;
  console.log(`✅ [Test 2] Inserted machine ID: ${createdId}, Slug: ${testSlug}`);

  // Test 3: Update machine
  const updateRes = await db.query(`
    UPDATE machines SET name = $1, price = $2, daily_income = $3 WHERE id = $4 RETURNING *
  `, ['Updated Test Titan Rig', 50000, 3500, createdId]);
  console.log(`✅ [Test 3] Updated machine name to: "${updateRes.rows[0].name}", Price: ${updateRes.rows[0].price}`);

  // Test 4: Delete machine
  await db.query('DELETE FROM machines WHERE id = $1', [createdId]);
  const verifyDelete = await db.query('SELECT * FROM machines WHERE id = $1', [createdId]);
  if (verifyDelete.rows.length === 0) {
    console.log(`✅ [Test 4] Successfully purged test machine ID: ${createdId}`);
  } else {
    console.error('❌ Failed to delete test machine.');
    process.exit(1);
  }

  console.log('\n🎉 ALL MACHINE CRUD BACKEND TESTS PASSED!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Test error:', err);
  process.exit(1);
});
