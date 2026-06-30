const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const db = require('../config/db');

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
  const { amount, fee, channel, destination } = req.body;

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
      `INSERT INTO withdrawals (user_id, reference, amount, fee, channel, destination, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'Success')`,
      [req.userId, refCode, amtVal, feeVal, channel, destination]
    );

    await db.query('COMMIT');
    res.json({ message: 'Withdrawal settlement completed successfully.', reference: refCode });
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('Withdrawal transaction failed:', err.message);
    res.status(500).json({ message: 'Error processing wallet payout transaction.' });
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

module.exports = router;
