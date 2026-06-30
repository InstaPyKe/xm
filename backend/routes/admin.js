const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_xm_key_109283';

// 1. POST ADMIN LOGIN
router.post('/login', async (req, res) => {
  const { pin } = req.body;
  if (pin === '222222') {
    // Generate Admin JWT Token
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    return res.json({ message: 'Admin authentication approved.', token });
  } else {
    return res.status(401).json({ message: 'Access denied. Incorrect security PIN.' });
  }
});

// Admin Authentication Middleware
function adminMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ message: 'Missing authorization headers.' });
  }
  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Malformed authorization token.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role === 'admin') {
      req.admin = decoded;
      next();
    } else {
      return res.status(403).json({ message: 'Forbidden. Administrative credentials required.' });
    }
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired credentials.' });
  }
}

// 2. GET ALL USERS WITH STATISTICS
router.get('/users', adminMiddleware, async (req, res) => {
  try {
    const usersRes = await db.query(
      `SELECT u.id, u.username, u.phone, u.referral, u.balance, u.leased_earnings, u.daily_growth, u.created_at,
       (SELECT COUNT(*) FROM leases l WHERE l.user_id = u.id AND l.remaining > 0) AS active_leases_count
       FROM users u ORDER BY u.id DESC`
    );
    res.json(usersRes.rows);
  } catch (err) {
    console.error('Admin users query failed:', err.message);
    res.status(500).json({ message: 'Error retrieving user ledger.' });
  }
});

// 3. PUT EDIT USER FIELDS (Balance, Leased Earnings, Daily Growth)
router.put('/users/:id', adminMiddleware, async (req, res) => {
  const userId = req.params.id;
  const { balance, leased_earnings, daily_growth } = req.body;

  try {
    await db.query(
      `UPDATE users SET 
       balance = $1, 
       leased_earnings = $2, 
       daily_growth = $3 
       WHERE id = $4`,
      [parseFloat(balance), parseFloat(leased_earnings), parseFloat(daily_growth), userId]
    );
    res.json({ message: 'User stats updated successfully.' });
  } catch (err) {
    console.error('Admin user edit query failed:', err.message);
    res.status(500).json({ message: 'Error updating user profile stats.' });
  }
});

// 4. DELETE USER PROFILE
router.delete('/users/:id', adminMiddleware, async (req, res) => {
  const userId = req.params.id;
  try {
    await db.query('DELETE FROM users WHERE id = $1', [userId]);
    res.json({ message: 'User profile purged successfully.' });
  } catch (err) {
    console.error('Admin user delete query failed:', err.message);
    res.status(500).json({ message: 'Error purging user profile.' });
  }
});

// 5. GET ALL SYSTEM LEASES
router.get('/leases', adminMiddleware, async (req, res) => {
  try {
    const leasesRes = await db.query(
      `SELECT l.*, u.username, u.phone 
       FROM leases l 
       JOIN users u ON l.user_id = u.id 
       ORDER BY l.id DESC`
    );
    res.json(leasesRes.rows);
  } catch (err) {
    console.error('Admin leases query failed:', err.message);
    res.status(500).json({ message: 'Error retrieving system leases.' });
  }
});

// 6. GET ALL WITHDRAWAL REQUESTS
router.get('/withdrawals', adminMiddleware, async (req, res) => {
  try {
    const withdrawalsRes = await db.query(
      `SELECT w.*, u.username, u.phone 
       FROM withdrawals w 
       JOIN users u ON w.user_id = u.id 
       ORDER BY w.id DESC`
    );
    res.json(withdrawalsRes.rows);
  } catch (err) {
    console.error('Admin withdrawals query failed:', err.message);
    res.status(500).json({ message: 'Error retrieving payout requests.' });
  }
});

// 7. PUT UPDATE WITHDRAWAL STATUS (Approve / Reject)
router.put('/withdrawals/:id', adminMiddleware, async (req, res) => {
  const withdrawalId = req.params.id;
  const { status } = req.body; // 'Success', 'Pending', 'Failed'

  try {
    // If rejecting/failing a withdrawal, refund user account balance!
    if (status === 'Failed') {
      const withdrawalQuery = await db.query('SELECT user_id, amount, fee, status FROM withdrawals WHERE id = $1', [withdrawalId]);
      if (withdrawalQuery.rows.length > 0) {
        const w = withdrawalQuery.rows[0];
        // Only refund if previous status wasn't already failed/refunded
        if (w.status !== 'Failed') {
          const totalRefund = parseFloat(w.amount) + parseFloat(w.fee);
          await db.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [totalRefund, w.user_id]);
        }
      }
    }

    await db.query(
      'UPDATE withdrawals SET status = $1 WHERE id = $2',
      [status, withdrawalId]
    );
    res.json({ message: 'Payout status updated successfully.' });
  } catch (err) {
    console.error('Admin withdrawal status update failed:', err.message);
    res.status(500).json({ message: 'Error processing withdrawal state change.' });
  }
});

// 8. POST CREATE LEASE FOR USER (POST /api/admin/leases)
router.post('/leases', adminMiddleware, async (req, res) => {
  const { user_id, node_id, name, type, speed, duration, cost, rate, daily_earnings, image } = req.body;

  try {
    // Check if user exists
    const userCheck = await db.query('SELECT id FROM users WHERE id = $1', [user_id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ message: 'User profile not found.' });
    }

    // Enforce 3-machine limit: if user has >= 3 active leases, expire the oldest one
    const activeCheck = await db.query('SELECT id FROM leases WHERE user_id = $1 AND remaining > 0 ORDER BY id ASC', [user_id]);
    if (activeCheck.rows.length >= 3) {
      const oldestId = activeCheck.rows[0].id;
      await db.query('UPDATE leases SET remaining = 0 WHERE id = $1', [oldestId]);
      console.log(`🧹 Expired oldest active lease ID: ${oldestId} to make room for new lease`);
    }

    // Insert new lease record
    const insertRes = await db.query(
      `INSERT INTO leases (user_id, node_id, name, type, status, speed, duration, remaining, cost, rate, daily_earnings, image)
       VALUES ($1, $2, $3, $4, 'Hashing', $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        user_id,
        node_id,
        name,
        type,
        speed,
        parseInt(duration),
        parseInt(duration),
        parseFloat(cost),
        parseFloat(rate),
        parseFloat(daily_earnings),
        image || '../public/images/blue_mainframe.png'
      ]
    );

    // Update user's daily growth rate to the sum of all active leases (including the new one)
    const sumRes = await db.query(
      'SELECT COALESCE(SUM(daily_earnings), 0.00) AS total FROM leases WHERE user_id = $1 AND remaining > 0',
      [user_id]
    );
    const totalDailyGrowth = parseFloat(sumRes.rows[0].total);
    await db.query('UPDATE users SET daily_growth = $1 WHERE id = $2', [totalDailyGrowth, user_id]);

    res.json({ message: 'Leased machine posted successfully to user.', lease_id: insertRes.rows[0].id });
  } catch (err) {
    console.error('Admin create lease query failed:', err.message);
    res.status(500).json({ message: 'Error posting leased machine to user.' });
  }
});

// 9. GET ALL SUCCESSFUL REFERRALS
router.get('/referrals', adminMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        u.id AS referee_id, u.username AS referee_username, u.phone AS referee_phone,
        r.id AS referrer_id, r.username AS referrer_username, r.phone AS referrer_phone,
        u.created_at AS date
       FROM users u 
       JOIN users r ON (u.referral = r.phone OR u.referral = r.username)
       ORDER BY u.id DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Admin referrals query failed:', err.message);
    res.status(500).json({ message: 'Error retrieving referrals ledger.' });
  }
});

module.exports = router;
