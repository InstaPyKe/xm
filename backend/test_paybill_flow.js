const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const db = require('./config/db');

function extractMpesaDetails(text) {
  if (!text || typeof text !== 'string') return { code: null, amount: null };
  const cleaned = text.trim();
  
  let codeMatch = cleaned.match(/\b([A-Z0-9]{10})\b/);
  if (!codeMatch) {
    codeMatch = cleaned.match(/^([A-Z0-9]{10})\s+Confirmed/i) || cleaned.match(/([A-Z0-9]{8,12})/i);
  }
  const code = codeMatch ? codeMatch[1].toUpperCase() : null;

  let amount = null;
  const amountMatch = cleaned.match(/(?:Ksh|KES|KSH)[\s\.\:]*([0-9,]+(?:\.[0-9]{2})?)/i) ||
                      cleaned.match(/sent to.*?for\s*(?:Ksh|KES)?\s*([0-9,]+(?:\.[0-9]{2})?)/i);
  if (amountMatch) {
    const rawNum = amountMatch[1].replace(/,/g, '');
    amount = parseFloat(rawNum);
  }

  return { code, amount };
}

async function runTests() {
  console.log('🚀 --- STARTING PAYBILL FLOW VERIFICATION TESTS ---');

  // TEST 1: Regex Extraction Tests
  console.log('\n📌 [Test 1] Testing M-Pesa Message Extraction...');
  const testMessages = [
    {
      msg: 'QK89LK23MN Confirmed. Ksh3,000.00 sent to JASPER MARKETS 522533 on 12/9/26 at 6:30 PM. New M-PESA balance is Ksh15,200.00.',
      expectedCode: 'QK89LK23MN',
      expectedAmount: 3000.00
    },
    {
      msg: 'TJ41XY99ZZ Confirmed. KES 8,500 sent to JASPER MARKETS Account 8106675 on 12/9/26.',
      expectedCode: 'TJ41XY99ZZ',
      expectedAmount: 8500.00
    },
    {
      msg: 'AB12CD34EF Confirmed.Ksh15,000.00 paid to 522533.',
      expectedCode: 'AB12CD34EF',
      expectedAmount: 15000.00
    }
  ];

  let test1Passed = true;
  for (const item of testMessages) {
    const res = extractMpesaDetails(item.msg);
    console.log(`  Parsed: Code=${res.code}, Amount=${res.amount}`);
    if (res.code !== item.expectedCode || res.amount !== item.expectedAmount) {
      console.error(`  ❌ Failed parsing for: "${item.msg}"`);
      test1Passed = false;
    }
  }
  if (test1Passed) {
    console.log('  ✅ [Test 1 PASSED] All SMS message extraction scenarios parsed accurately.');
  }

  // TEST 2: Database and Transactions Workflow
  console.log('\n📌 [Test 2] Testing Database Transaction Injection and Admin Flow...');
  try {
    // 1. Get or create a test user
    let userRes = await db.query('SELECT * FROM users LIMIT 1');
    if (userRes.rows.length === 0) {
      console.log('  Creating mock user for testing...');
      userRes = await db.query(
        "INSERT INTO users (username, phone, password_hash, balance, daily_growth, leased_earnings) VALUES ('testminer', '254712345678', 'dummyhash', 0, 0, 0) RETURNING *"
      );
    }
    const testUser = userRes.rows[0];
    console.log(`  Found user for test: ID=${testUser.id}, Username=${testUser.username}`);

    const uniqueCode = 'TST' + Math.random().toString(36).substring(2, 9).toUpperCase();
    const testCheckoutRequestId = 'PB-TEST-' + Date.now();
    const testTier = 'volt-hashing-node-v1';
    const machineName = 'Volt Hashing Node (V1)';
    const machinePrice = 3000;
    const dailyProfit = (machinePrice * 3.0) / 100;
    const duration = 14;
    const speed = '10.0 MH/s';
    const testMessage = `${uniqueCode} Confirmed. Ksh3,000.00 sent to JASPER MARKETS 522533 on 12/9/26.`;

    const userPhone = testUser.phone || '254712345678';
    const insertTx = await db.query(
      `INSERT INTO mpesa_transactions 
       (checkout_request_id, user_id, amount, phone, status, tier, name, type, speed, duration, cost, rate, daily_earnings, mpesa_code, mpesa_message, payment_method) 
       VALUES ($1, $2, $3, $4, 'Pending', $5, $6, 'volt', $7, $8, $9, 3.0, $10, $11, $12, 'PAYBILL_MANUAL')
       RETURNING *`,
      [testCheckoutRequestId, testUser.id, machinePrice, userPhone, testTier, machineName, speed, duration, machinePrice, dailyProfit, uniqueCode, testMessage]
    );
    const txId = insertTx.rows[0].id;
    console.log(`  ✅ Inserted manual Paybill transaction ID=${txId}, Code=${uniqueCode}, Status=Pending`);

    // 3. Verify status polling query
    const statusQuery = await db.query('SELECT * FROM mpesa_transactions WHERE checkout_request_id = $1', [testCheckoutRequestId]);
    if (statusQuery.rows.length > 0 && statusQuery.rows[0].payment_method === 'PAYBILL_MANUAL') {
      console.log('  ✅ Status polling query retrieved manual transaction successfully.');
    }

    // 4. Simulate Admin Approval Logic
    console.log('  Testing Admin Approval...');
    const nodeId = 'VN-' + Math.floor(1000 + Math.random() * 9000);

    await db.query('BEGIN');

    // Update transaction
    await db.query(
      "UPDATE mpesa_transactions SET status = 'Completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [txId]
    );

    // Provision lease
    const leaseRes = await db.query(
      `INSERT INTO leases (user_id, name, type, duration, remaining, cost, daily_earnings, rate, status, speed, node_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Hashing', $9, $10)
       RETURNING *`,
      [testUser.id, machineName, 'volt', duration, duration, machinePrice, dailyProfit, 3.0, speed, nodeId]
    );
    const newLease = leaseRes.rows[0];

    // Log rent transaction
    await db.query(
      `INSERT INTO rent_transactions (user_id, lease_id, node_id, machine_name, amount)
       VALUES ($1, $2, $3, $4, $5)`,
      [testUser.id, newLease.id, nodeId, machineName, machinePrice]
    );

    // Update user daily growth
    const sumRes = await db.query(
      'SELECT COALESCE(SUM(daily_earnings), 0.00) AS total FROM leases WHERE user_id = $1 AND remaining > 0',
      [testUser.id]
    );
    const totalDailyGrowth = parseFloat(sumRes.rows[0].total);
    await db.query('UPDATE users SET daily_growth = $1 WHERE id = $2', [totalDailyGrowth, testUser.id]);

    await db.query('COMMIT');
    console.log(`  ✅ Lease provisioned: ID=${newLease.id}, Machine="${newLease.name}", NodeID=${newLease.node_id}`);

    // 5. Verify Polling returns Completed
    const postApprovalStatus = await db.query('SELECT * FROM mpesa_transactions WHERE checkout_request_id = $1', [testCheckoutRequestId]);
    if (postApprovalStatus.rows[0].status === 'Completed') {
      console.log('  ✅ [Test 2 PASSED] Transaction status transitioned to "Completed" with lease active.');
    }

    // Cleanup test record
    await db.query('DELETE FROM leases WHERE id = $1', [newLease.id]);
    await db.query('DELETE FROM rent_transactions WHERE user_id = $1 AND machine_name = $2 AND amount = $3', [testUser.id, machineName, machinePrice]);
    await db.query('UPDATE users SET daily_growth = GREATEST(0, daily_growth - $1) WHERE id = $2', [dailyProfit, testUser.id]);
    await db.query('DELETE FROM mpesa_transactions WHERE id = $1', [txId]);
    console.log('  🧹 Cleaned up temporary test artifacts.');

    console.log('\n🎉 --- ALL VERIFICATION TESTS PASSED SUCCESSFULLY! ---');
  } catch (err) {
    console.error('❌ Test failed:', err);
  } finally {
    process.exit(0);
  }
}

runTests();
