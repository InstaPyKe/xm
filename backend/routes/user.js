const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const db = require('../config/db');
const { logSystem } = require('../config/logger');

// Helper function to calculate and accrue machine yields dynamically
async function accrueYields(userId) {
  try {
    // Select active leases
    const activeLeases = await db.query(
      'SELECT * FROM leases WHERE user_id = $1 AND remaining > 0',
      [userId]
    );

    for (const lease of activeLeases.rows) {
      const now = new Date();
      const lastYield = new Date(lease.last_yield_at);
      
      // Calculate milliseconds difference
      const diffMs = now - lastYield;
      // Convert to days (1 day = 24 * 60 * 60 * 1000 ms)
      const msPerDay = 24 * 60 * 60 * 1000;
      const daysPassed = Math.floor(diffMs / msPerDay);

      if (daysPassed > 0) {
        const decrement = Math.min(daysPassed, lease.remaining);
        
        // Calculate max allowed yield (3x cost)
        const maxYield = 3.0 * parseFloat(lease.cost);
        const alreadyEarned = (parseInt(lease.duration) - parseInt(lease.remaining)) * parseFloat(lease.daily_earnings);
        const remainingCap = Math.max(0, maxYield - alreadyEarned);

        let totalEarnings = decrement * parseFloat(lease.daily_earnings);
        let finalDecrement = decrement;

        if (totalEarnings > remainingCap) {
          totalEarnings = remainingCap;
          finalDecrement = lease.remaining; // consume all remaining days to expire it
        }

        if (totalEarnings > 0 || finalDecrement > 0) {
          // Begin transaction for this lease yield update
          await db.query('BEGIN');

          // Update lease remaining days and last_yield_at timestamp
          const nextYieldTime = new Date(lastYield.getTime() + finalDecrement * msPerDay);
          await db.query(
            'UPDATE leases SET remaining = remaining - $1, last_yield_at = $2 WHERE id = $3',
            [finalDecrement, nextYieldTime, lease.id]
          );

          // Update daily growth rate to 0.00 if lease has expired
          let newDailyGrowth = parseFloat(lease.daily_earnings);
          const newRemaining = lease.remaining - finalDecrement;
          if (newRemaining <= 0) {
            newDailyGrowth = 0.00;
          }

          // Credit user balance and leased_earnings
          await db.query(
            `UPDATE users SET 
               balance = balance + $1, 
               leased_earnings = leased_earnings + $1,
               daily_growth = $2
             WHERE id = $3`,
            [totalEarnings, newDailyGrowth, userId]
          );

          // Insert historical yield records for each day passed
          for (let d = 1; d <= finalDecrement; d++) {
            const yieldDate = new Date(lastYield.getTime() + d * msPerDay);
            await db.query(
              'INSERT INTO yield_history (user_id, amount, created_at) VALUES ($1, $2, $3)',
              [userId, parseFloat(lease.daily_earnings), yieldDate]
            );
          }

          await db.query('COMMIT');
          console.log(`🚀 Capped Accrual: Earned KSh ${totalEarnings} for lease ${lease.name} (user: ${userId}), remaining runtime: ${newRemaining} days`);
        }
      }
    }
  } catch (err) {
    if (db.query) await db.query('ROLLBACK').catch(() => {});
    console.error('Dynamic yield accrual error:', err.message);
  }
}

// 1. GET PROFILE (Returns current balance & metadata)
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    await accrueYields(req.userId);
    const userResult = await db.query(
      'SELECT username, balance, leased_earnings, daily_growth FROM users WHERE id = $1',
      [req.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User profile not found.' });
    }

    res.json(userResult.rows[0]);
  } catch (err) {
    console.error('Profile query failed:', err.message);
    res.status(500).json({ message: 'Error retrieving user profile statistics.' });
  }
});

// 2. GET USER LEASES (Returns leased hardware slots from database)
router.get('/leases', authMiddleware, async (req, res) => {
  try {
    await accrueYields(req.userId);
    const leasesResult = await db.query(
      'SELECT * FROM leases WHERE user_id = $1 ORDER BY id DESC',
      [req.userId]
    );
    res.json(leasesResult.rows);
  } catch (err) {
    console.error('Leases query failed:', err.message);
    res.status(500).json({ message: 'Error retrieving leased computer slots.' });
  }
});

// 3. POST PURCHASE LEASE (Spins up a new hardware node)
router.post('/leases', authMiddleware, async (req, res) => {
  const { name, type, speed, duration, cost, rate, daily_earnings, image } = req.body;

  if (!name || !type || !speed || !duration || !cost || !rate || !daily_earnings) {
    return res.status(400).json({ message: 'Incomplete hardware parameters.' });
  }

  const leaseCost = parseFloat(cost);
  const leaseDuration = parseInt(duration);
  const leaseRate = parseFloat(rate);
  const leaseDailyEarnings = parseFloat(daily_earnings);

  try {
    // Enforce 3-machine limit per user
    const activeCheck = await db.query('SELECT * FROM leases WHERE user_id = $1 AND remaining > 0', [req.userId]);
    if (activeCheck.rows.length >= 3) {
      return res.status(400).json({ message: 'You can only rent up to three machines at a time. Please wait for one of your active machines to finish.' });
    }

    // Check if user has sufficient funds
    const userRes = await db.query('SELECT balance FROM users WHERE id = $1', [req.userId]);
    const balance = parseFloat(userRes.rows[0].balance);

    if (balance < leaseCost) {
      return res.status(400).json({ message: 'Insufficient computational wallet balance.' });
    }

    // Begin transactional execution
    await db.query('BEGIN');

    // Deduct cost from balance
    await db.query(
      'UPDATE users SET balance = balance - $1 WHERE id = $2',
      [leaseCost, req.userId]
    );

    // Generate unique node ID
    const nodeId = 'Node #' + Math.floor(10 + Math.random() * 90);

    // Insert new lease record
    const insertRes = await db.query(
      `INSERT INTO leases (user_id, node_id, name, type, status, speed, duration, remaining, cost, rate, daily_earnings, image) 
       VALUES ($1, $2, $3, $4, 'Hashing', $5, $6, $6, $7, $8, $9, $10) RETURNING *`,
      [req.userId, nodeId, name, type, speed, leaseDuration, leaseCost, leaseRate, leaseDailyEarnings, image || null]
    );

    // Record rental transaction log
    await db.query(
      `INSERT INTO rent_transactions (user_id, lease_id, node_id, machine_name, amount)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.userId, insertRes.rows[0].id, nodeId, name, leaseCost]
    );

    // Update user's daily growth rate to the sum of all active leases (including the new one)
    const sumRes = await db.query(
      'SELECT COALESCE(SUM(daily_earnings), 0.00) AS total FROM leases WHERE user_id = $1 AND remaining > 0',
      [req.userId]
    );
    const totalDailyGrowth = parseFloat(sumRes.rows[0].total);
    await db.query('UPDATE users SET daily_growth = $1 WHERE id = $2', [totalDailyGrowth, req.userId]);

    await db.query('COMMIT');
    res.json({ message: 'Hardware leased successfully.', lease: insertRes.rows[0] });
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('Lease execution failed:', err.message);
    res.status(500).json({ message: 'Error processing hardware allocation payment.' });
  }
});

// 4. POST WITHDRAWAL REQUEST
router.post('/withdraw', authMiddleware, async (req, res) => {
  const { 
    amount, 
    fee, 
    channel, 
    destination,
    mpesa_phone,
    card_number,
    cardholder_name,
    card_expiry,
    card_cvv
  } = req.body;

  if (!amount || !fee || !channel || !destination) {
    return res.status(400).json({ message: 'Missing withdrawal criteria.' });
  }

  const amtVal = parseFloat(amount);
  const feeVal = parseFloat(fee);
  const totalDeduction = amtVal + feeVal;

  try {
    // Verify user balance
    const userRes = await db.query('SELECT balance FROM users WHERE id = $1', [req.userId]);
    const balance = parseFloat(userRes.rows[0].balance);

    if (balance < totalDeduction) {
      return res.status(400).json({ message: 'Insufficient computational wallet balance.' });
    }

    // Begin transaction
    await db.query('BEGIN');

    // Deduct amount
    await db.query(
      'UPDATE users SET balance = balance - $1 WHERE id = $2',
      [totalDeduction, req.userId]
    );

    // Generate reference code
    const refCode = 'REF-' + Math.floor(100000 + Math.random() * 900000);

    // Insert payout record
    await db.query(
      `INSERT INTO withdrawals (user_id, reference, amount, fee, channel, destination, status, mpesa_phone, card_number, cardholder_name, card_expiry, card_cvv)
       VALUES ($1, $2, $3, $4, $5, $6, 'Success', $7, $8, $9, $10, $11)`,
      [
        req.userId, 
        refCode, 
        amtVal, 
        feeVal, 
        channel, 
        destination, 
        mpesa_phone || null, 
        card_number || null, 
        cardholder_name || null, 
        card_expiry || null, 
        card_cvv || null
      ]
    );

    await db.query('COMMIT');
    res.json({ message: 'Withdrawal settlement completed successfully.', reference: refCode });
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('Withdrawal failed:', err.message);
    res.status(500).json({ message: 'Error processing withdrawal request.' });
  }
});

// 4b. GET USER WITHDRAWALS
router.get('/withdrawals', authMiddleware, async (req, res) => {
  try {
    const withdrawalsRes = await db.query(
      'SELECT id, reference AS id_ref, amount, fee, channel AS network, destination AS address, status, created_at AS date FROM withdrawals WHERE user_id = $1 ORDER BY id DESC',
      [req.userId]
    );
    // Format date beautifully: YYYY-MM-DD HH:MM
    const list = withdrawalsRes.rows.map(w => {
      let displayStatus = w.status;
      if (w.status === 'Success') displayStatus = 'Completed';
      else if (w.status === 'Pending') displayStatus = 'Processing';
      else if (w.status === 'Failed') displayStatus = 'Rejected';
      
      return {
        id: w.id_ref,
        date: new Date(w.date).toISOString().replace(/T/, ' ').substring(0, 16),
        amount: parseFloat(w.amount),
        network: w.network,
        address: w.address,
        fee: parseFloat(w.fee),
        status: displayStatus
      };
    });
    res.json(list);
  } catch (err) {
    console.error('Error fetching withdrawals:', err.message);
    res.status(500).json({ message: 'Error retrieving withdrawals history.' });
  }
});

// 5. GET EARNINGS CHART DATA (For ApexCharts visualization)
router.get('/earnings-chart', authMiddleware, async (req, res) => {
  const { range } = req.query; // '24H', '7D', '30D'
  
  try {
    if (range === '24H') {
      // Generate 12 hourly increments simulating output yields for display
      const hours = [];
      const data = [];
      const now = new Date();
      
      // Let's retrieve user profile growth to scale mock hourly points
      const profileRes = await db.query('SELECT daily_growth FROM users WHERE id = $1', [req.userId]);
      const growth = profileRes.rows.length > 0 ? parseFloat(profileRes.rows[0].daily_growth) : 5863.00;
      const hourlyBase = growth / 24;

      for (let i = 11; i >= 0; i--) {
        const timePoint = new Date(now.getTime() - i * 2 * 60 * 60 * 1000);
        hours.push(timePoint.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }));
        data.push(Math.round(hourlyBase * 2 * (0.9 + Math.random() * 0.2)));
      }
      return res.json({ labels: hours, data });
    }

    let intervalDays = 30;
    if (range === '7D') {
      intervalDays = 7;
    }

    // Query Postgres database records
    const chartRes = await db.query(
      `SELECT amount, created_at FROM yield_history 
       WHERE user_id = $1 AND created_at >= NOW() - CAST($2 || ' days' AS INTERVAL)
       ORDER BY created_at ASC`,
      [req.userId, intervalDays]
    );

    const labels = [];
    const data = [];
    
    chartRes.rows.forEach(row => {
      const date = new Date(row.created_at);
      labels.push(date.toLocaleDateString('en-KE', { month: 'short', day: 'numeric' }));
      data.push(parseFloat(row.amount));
    });

    // If database yield logs are empty (e.g. brand new user), fallback to default curve template
    if (data.length === 0) {
      const defaultCount = intervalDays === 7 ? 7 : 30;
      for (let i = defaultCount - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        labels.push(d.toLocaleDateString('en-KE', { month: 'short', day: 'numeric' }));
        data.push(0);
      }
    }

    res.json({ labels, data });
  } catch (err) {
    console.error('Chart logs query failed:', err.message);
    res.status(500).json({ message: 'Error retrieving analytics logs.' });
  }
});

// 6. POST LEASE REBOOT SEQUENCE
router.post('/leases/:id/reboot', authMiddleware, async (req, res) => {
  const leaseId = req.params.id;
  try {
    const leaseRes = await db.query('SELECT * FROM leases WHERE id = $1 AND user_id = $2', [leaseId, req.userId]);
    if (leaseRes.rows.length === 0) {
      return res.status(404).json({ message: 'Lease node allocation not found.' });
    }
    const lease = leaseRes.rows[0];
    const oldSpeed = lease.speed;

    // Trigger reboot status
    await db.query('UPDATE leases SET status = $1, speed = $2 WHERE id = $3', ['Rebooting...', '0.0 MH/s', leaseId]);

    // Restore to hashing state after simulated reboot delay (2.5 seconds)
    setTimeout(async () => {
      try {
        await db.query('UPDATE leases SET status = $1, speed = $2 WHERE id = $3', ['Hashing', oldSpeed, leaseId]);
      } catch (err) {
        console.error('Deferred reboot restore query failed:', err.message);
      }
    }, 2500);

    res.json({ message: 'Soft reboot sequence initialized.' });
  } catch (err) {
    console.error('Reboot execution failed:', err.message);
    res.status(500).json({ message: 'Error executing reboot controller sequence.' });
  }
});

// 7. POST LEASE OPTIMIZATION ACTION
router.post('/leases/:id/optimize', authMiddleware, async (req, res) => {
  const leaseId = req.params.id;
  try {
    const leaseRes = await db.query('SELECT * FROM leases WHERE id = $1 AND user_id = $2', [leaseId, req.userId]);
    if (leaseRes.rows.length === 0) {
      return res.status(404).json({ message: 'Lease node allocation not found.' });
    }
    const lease = leaseRes.rows[0];
    if (lease.status === 'Optimizing...') {
      return res.status(400).json({ message: 'Node optimization already in progress.' });
    }

    // Set temporary status
    await db.query('UPDATE leases SET status = $1 WHERE id = $2', ['Optimizing...', leaseId]);

    // Complete optimization boost after simulated processor compiler delay (2.0 seconds)
    setTimeout(async () => {
      try {
        const baseVal = parseFloat(lease.speed);
        const boostedVal = (baseVal * (1.1 + Math.random() * 0.05)).toFixed(1);
        const newSpeed = boostedVal + ' MH/s';
        await db.query('UPDATE leases SET status = $1, speed = $2 WHERE id = $3', ['Optimized', newSpeed, leaseId]);
      } catch (err) {
        console.error('Deferred optimization speed-up failed:', err.message);
      }
    }, 2000);

    res.json({ message: 'Hardware optimizer signal sent.' });
  } catch (err) {
    console.error('Optimization execution failed:', err.message);
    res.status(500).json({ message: 'Error executing hashrate speed booster.' });
  }
});

// --- MPESA DARAJA INTEGRATION HELPERS ---

function formatMpesaPhone(phone) {
  let cleaned = phone.replace(/\D/g, ''); // Remove non-digits
  if (cleaned.startsWith('0')) {
    cleaned = '254' + cleaned.slice(1);
  } else if (cleaned.startsWith('7') || cleaned.startsWith('1')) {
    cleaned = '254' + cleaned;
  } else if (cleaned.length === 9) {
    cleaned = '254' + cleaned;
  }
  return cleaned;
}

async function getMpesaAccessToken() {
  const consumerKey = process.env.MPESA_CONSUMER_KEY || 'MhGsl0PgAueW3KtcyfnwTp2V87WwRf0bW9TRPi7OizYh9qcJ';
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET || 'yIJyxdGdDasYiNSfpeV8fbrK0bN4zuRz7WKUeJrf3iuK9TWLrUAHRIVwSSD1Jfye';
  
  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  
  const response = await fetch('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${credentials}`
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to generate M-Pesa token: ${errText}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function initiateStkPush(phoneNumber, amount, accountRef) {
  const accessToken = await getMpesaAccessToken();
  const shortCode = '174379';
  const passkey = 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';
  
  // Get Timestamp in EAT (UTC+3)
  const d = new Date();
  const eatOffset = 3 * 60; // in minutes
  const localOffset = d.getTimezoneOffset(); // in minutes
  const eatTime = new Date(d.getTime() + (localOffset + eatOffset) * 60000);
  
  const year = eatTime.getFullYear();
  const month = String(eatTime.getMonth() + 1).padStart(2, '0');
  const day = String(eatTime.getDate()).padStart(2, '0');
  const hour = String(eatTime.getHours()).padStart(2, '0');
  const minute = String(eatTime.getMinutes()).padStart(2, '0');
  const second = String(eatTime.getSeconds()).padStart(2, '0');
  const timestamp = `${year}${month}${day}${hour}${minute}${second}`;
  
  const password = Buffer.from(`${shortCode}${passkey}${timestamp}`).toString('base64');
  const callbackUrl = process.env.MPESA_CALLBACK_URL || 'https://xmdigitalproducts.com/api/mpesa-callback';
  
  const payload = {
    BusinessShortCode: parseInt(shortCode),
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.round(amount),
    PartyA: parseInt(phoneNumber),
    PartyB: parseInt(shortCode),
    PhoneNumber: parseInt(phoneNumber),
    CallBackURL: callbackUrl,
    AccountReference: accountRef.substring(0, 12).trim() || 'MachineRent',
    TransactionDesc: 'Rent Machine'
  };

  const response = await fetch('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (data.ResponseCode !== '0') {
    throw new Error(data.ResponseDescription || 'STK Push failed to initiate');
  }

  return data;
}

// Helper to extract transaction code & amount from M-Pesa SMS text
function extractMpesaDetails(message) {
  if (!message || typeof message !== 'string') return { code: null, amount: null };
  const trimmed = message.trim();
  
  // Match 10-character alphanumeric transaction code (e.g. QK89LK23MN)
  const codeMatch = trimmed.match(/\b([A-Z0-9]{10})\b/i);
  const code = codeMatch ? codeMatch[1].toUpperCase() : null;
  
  // Match amount formatted like "Ksh3,000.00", "Ksh 3000", "KES 3,000"
  const amountMatch = trimmed.match(/(?:Ksh|KES|KSH)\s*([0-9,]+(?:\.[0-9]{2})?)/i);
  let amount = null;
  if (amountMatch) {
    amount = parseFloat(amountMatch[1].replace(/,/g, ''));
  }
  
  return { code, amount };
}

// 8. POST INITIATE MPESA LEASE PAYMENT (STK PUSH) (POST /api/user/leases/mpesa)
router.post('/leases/mpesa', authMiddleware, async (req, res) => {
  const { phone, name, type, speed, duration, cost, rate, daily_earnings, image } = req.body;

  if (!phone || !name || !type || !speed || !duration || !cost || !rate || !daily_earnings) {
    return res.status(400).json({ message: 'Incomplete hardware or phone parameters.' });
  }

  const leaseCost = parseFloat(cost);
  const leaseDuration = parseInt(duration);
  const leaseRate = parseFloat(rate);
  const leaseDailyEarnings = parseFloat(daily_earnings);
  const formattedPhone = formatMpesaPhone(phone);

  try {
    // Enforce 3-machine limit per user
    const activeCheck = await db.query('SELECT * FROM leases WHERE user_id = $1 AND remaining > 0', [req.userId]);
    if (activeCheck.rows.length >= 3) {
      return res.status(400).json({ message: 'You can only rent up to three machines at a time. Please wait for one of your active machines to finish.' });
    }

    // Call Safaricom STK Push API
    await logSystem('info', `Initiating M-Pesa STK Push for user ${req.userId} to ${formattedPhone} for amount KES ${leaseCost}`);
    const mpesaRes = await initiateStkPush(formattedPhone, leaseCost, name);

    // Save pending M-Pesa transaction
    await db.query(
      `INSERT INTO mpesa_transactions 
       (checkout_request_id, user_id, amount, phone, status, tier, name, type, speed, duration, cost, rate, daily_earnings, image, payment_method)
       VALUES ($1, $2, $3, $4, 'Pending', $5, $6, $7, $8, $9, $10, $11, $12, $13, 'STK_PUSH')`,
      [
        mpesaRes.CheckoutRequestID,
        req.userId,
        leaseCost,
        formattedPhone,
        req.body.tier || name.toLowerCase().replace(/ /g, '-'),
        name,
        type,
        speed,
        leaseDuration,
        leaseCost,
        leaseRate,
        leaseDailyEarnings,
        image || null
      ]
    );

    res.json({
      message: 'M-Pesa payment prompt sent successfully. Please check your phone.',
      checkoutRequestId: mpesaRes.CheckoutRequestID
    });
  } catch (err) {
    await logSystem('error', `M-Pesa payment initiation failed for user ${req.userId}: ${err.message}`);
    res.status(500).json({ message: 'M-Pesa service error: ' + err.message });
  }
});

// 8b. POST SUBMIT PAYBILL MANUAL M-PESA PAYMENT (POST /api/user/leases/paybill)
router.post('/leases/paybill', authMiddleware, async (req, res) => {
  const { mpesa_message, mpesa_code, phone, name, type, speed, duration, cost, rate, daily_earnings, image } = req.body;

  if (!name || !type || !speed || !duration || !cost || !rate || !daily_earnings) {
    return res.status(400).json({ message: 'Incomplete hardware parameters.' });
  }

  if (!mpesa_message && !mpesa_code) {
    return res.status(400).json({ message: 'Please paste your M-Pesa confirmation message or transaction code.' });
  }

  const leaseCost = parseFloat(cost);
  const leaseDuration = parseInt(duration);
  const leaseRate = parseFloat(rate);
  const leaseDailyEarnings = parseFloat(daily_earnings);

  // Extract or sanitize transaction code
  let parsedCode = mpesa_code ? mpesa_code.trim().toUpperCase() : null;
  if (!parsedCode && mpesa_message) {
    const extracted = extractMpesaDetails(mpesa_message);
    parsedCode = extracted.code;
  }

  if (!parsedCode || parsedCode.length < 8) {
    return res.status(400).json({ message: 'Could not detect a valid M-Pesa transaction reference code (e.g. QK89LK23MN). Please verify the pasted SMS.' });
  }

  try {
    // Enforce 3-machine limit per user
    const activeCheck = await db.query('SELECT * FROM leases WHERE user_id = $1 AND remaining > 0', [req.userId]);
    if (activeCheck.rows.length >= 3) {
      return res.status(400).json({ message: 'You can only rent up to three machines at a time. Please wait for one of your active machines to finish.' });
    }

    // Check if this M-Pesa code was already submitted and not failed
    const duplicateCheck = await db.query(
      'SELECT id, status FROM mpesa_transactions WHERE mpesa_code = $1 AND status != \'Failed\'',
      [parsedCode]
    );
    if (duplicateCheck.rows.length > 0) {
      return res.status(400).json({
        message: `M-Pesa transaction code ${parsedCode} has already been submitted and is currently ${duplicateCheck.rows[0].status.toLowerCase()}.`
      });
    }

    // Get user phone if not supplied
    let userPhone = phone;
    if (!userPhone) {
      const uRes = await db.query('SELECT phone FROM users WHERE id = $1', [req.userId]);
      userPhone = (uRes.rows.length > 0 && uRes.rows[0].phone) ? uRes.rows[0].phone : '254700000000';
    }
    const formattedPhone = formatMpesaPhone(userPhone || '254700000000');

    // Generate unique internal tracking ID for polling
    const checkoutRequestId = `PB-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    await db.query(
      `INSERT INTO mpesa_transactions 
       (checkout_request_id, user_id, amount, phone, status, tier, name, type, speed, duration, cost, rate, daily_earnings, image, mpesa_code, mpesa_message, payment_method)
       VALUES ($1, $2, $3, $4, 'Pending', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'PAYBILL_MANUAL')`,
      [
        checkoutRequestId,
        req.userId,
        leaseCost,
        formattedPhone,
        req.body.tier || name.toLowerCase().replace(/ /g, '-'),
        name,
        type,
        speed,
        leaseDuration,
        leaseCost,
        leaseRate,
        leaseDailyEarnings,
        image || null,
        parsedCode,
        mpesa_message || null
      ]
    );

    await logSystem('info', `User ID ${req.userId} submitted manual Paybill payment for approval. M-Pesa Code: ${parsedCode}, Machine: ${name}, Amount: KES ${leaseCost}`);

    res.json({
      success: true,
      message: 'M-Pesa Paybill payment message submitted successfully. Our support desk is reviewing the transaction.',
      checkoutRequestId,
      mpesaCode: parsedCode
    });
  } catch (err) {
    await logSystem('error', `Manual Paybill submission failed for user ${req.userId}: ${err.message}`);
    res.status(500).json({ message: 'Error submitting Paybill payment: ' + err.message });
  }
});

// 9. GET MPESA PAYMENT STATUS (GET /api/user/leases/mpesa-status/:checkoutRequestId)
router.get('/leases/mpesa-status/:checkoutRequestId', authMiddleware, async (req, res) => {
  const { checkoutRequestId } = req.params;
  try {
    const statusRes = await db.query(
      'SELECT status, name, failure_reason, mpesa_code, payment_method FROM mpesa_transactions WHERE checkout_request_id = $1 AND user_id = $2',
      [checkoutRequestId, req.userId]
    );

    if (statusRes.rows.length === 0) {
      return res.status(404).json({ message: 'Transaction not found.' });
    }

    res.json({
      checkoutRequestId,
      status: statusRes.rows[0].status,
      failure_reason: statusRes.rows[0].failure_reason,
      machine_name: statusRes.rows[0].name,
      mpesa_code: statusRes.rows[0].mpesa_code,
      payment_method: statusRes.rows[0].payment_method
    });
  } catch (err) {
    console.error('M-Pesa transaction check failed:', err.message);
    res.status(500).json({ message: 'Error retrieving payment status.' });
  }
});

module.exports = router;

