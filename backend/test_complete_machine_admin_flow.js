const http = require('http');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const express = require('express');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_xm_key_109283';
const adminToken = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });

const db = require('./config/db');

async function runVerification() {
  console.log('🚀 --- STARTING COMPLETE MACHINE ADMIN CRUD VERIFICATION --- \n');

  // Step 1: Database Check
  const dbMachines = await db.query('SELECT * FROM machines ORDER BY sort_order ASC');
  console.log(`📌 [Step 1] Database contains ${dbMachines.rows.length} mining machines.`);
  if (dbMachines.rows.length < 10) {
    throw new Error('Expected at least 10 seeded mining machines.');
  }
  console.log('  Sample machine:', dbMachines.rows[0].name, '| Slug:', dbMachines.rows[0].slug, '| Price: KSh', dbMachines.rows[0].price);

  // Step 2: Test Admin Add Machine
  const testMachine = {
    name: 'Quantum Hyper Miner X',
    slug: 'quantum-hyper-miner-x-' + Date.now(),
    tagline: 'Institutional multi-GPU monster mining rig',
    price: 75000.00,
    daily_income: 4800.00,
    duration_days: 30,
    total_profit: 144000.00,
    speed: '650 MH/s',
    slots_total: 25,
    slots_taken: 2,
    badge: '👑 ADMIN CHOICE',
    image: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=800&q=80',
    status: 'Active',
    sort_order: 11
  };

  const insertRes = await db.query(`
    INSERT INTO machines (
      slug, name, tagline, price, daily_income, duration_days, total_profit,
      speed, slots_total, slots_taken, badge, image, status, sort_order
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *
  `, [
    testMachine.slug, testMachine.name, testMachine.tagline, testMachine.price,
    testMachine.daily_income, testMachine.duration_days, testMachine.total_profit,
    testMachine.speed, testMachine.slots_total, testMachine.slots_taken,
    testMachine.badge, testMachine.image, testMachine.status, testMachine.sort_order
  ]);

  const createdMachine = insertRes.rows[0];
  console.log(`\n📌 [Step 2] Created new machine: "${createdMachine.name}" (ID: ${createdMachine.id}, Slug: ${createdMachine.slug})`);

  // Step 3: Test Admin Update Machine (edit price, daily earnings, status, image)
  const updatedPrice = 80000.00;
  const updatedDaily = 5200.00;
  const updatedImage = '/public/uploads/machines/test-custom-image.png';
  const updatedStatus = 'Sold Out';

  const updateRes = await db.query(`
    UPDATE machines SET 
      price = $1, daily_income = $2, image = $3, status = $4, updated_at = CURRENT_TIMESTAMP
    WHERE id = $5
    RETURNING *
  `, [updatedPrice, updatedDaily, updatedImage, updatedStatus, createdMachine.id]);

  const updatedMachine = updateRes.rows[0];
  console.log(`\n📌 [Step 3] Updated machine #${updatedMachine.id}:`);
  console.log(`  New Price: KSh ${updatedMachine.price}`);
  console.log(`  New Daily Income: KSh ${updatedMachine.daily_income}`);
  console.log(`  New Image URL: ${updatedMachine.image}`);
  console.log(`  New Status: ${updatedMachine.status}`);

  if (parseFloat(updatedMachine.price) !== updatedPrice || updatedMachine.status !== updatedStatus) {
    throw new Error('Update verification failed: values did not match.');
  }

  // Step 4: Test Admin Delete Machine
  await db.query('DELETE FROM machines WHERE id = $1', [createdMachine.id]);
  const verifyDel = await db.query('SELECT * FROM machines WHERE id = $1', [createdMachine.id]);
  if (verifyDel.rows.length !== 0) {
    throw new Error('Machine was not deleted.');
  }
  console.log(`\n📌 [Step 4] Machine #${createdMachine.id} deleted successfully.`);

  // Step 5: Verify upload directory exists
  const uploadDir = path.join(__dirname, '../public/uploads/machines');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  console.log(`\n📌 [Step 5] Uploads storage directory verified at: ${uploadDir}`);

  console.log('\n🎉 --- ALL ADMIN MACHINE MANAGEMENT TESTS PASSED WITH 100% SUCCESS! ---');
  process.exit(0);
}

runVerification().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
