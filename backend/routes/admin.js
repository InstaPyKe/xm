const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../config/db');
const { logSystem } = require('../config/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_xm_key_109283';

// Configure multer storage for machine images
const uploadDir = path.join(__dirname, '../../public/uploads/machines');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const machineStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'machine-' + uniqueSuffix + ext);
  }
});

const uploadMachineImage = multer({
  storage: machineStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif|svg/;
    const extname = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowed.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files (JPEG, PNG, WebP, GIF, SVG) are allowed.'));
  }
});

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
       RETURNING id, cost`,
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

    // Record rental transaction log
    await db.query(
      `INSERT INTO rent_transactions (user_id, lease_id, node_id, machine_name, amount)
       VALUES ($1, $2, $3, $4, $5)`,
      [user_id, insertRes.rows[0].id, node_id, name, parseFloat(cost)]
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

// 10. GET SYSTEM SETTINGS
router.get('/settings', adminMiddleware, (req, res) => {
  const settingsHelper = require('../config/settingsHelper');
  res.json(settingsHelper.getSettings());
});

// 11. POST UPDATE SYSTEM SETTINGS
router.post('/settings', adminMiddleware, (req, res) => {
  const settingsHelper = require('../config/settingsHelper');
  const { registration_enabled, maintenance_mode } = req.body;
  
  const current = settingsHelper.getSettings();
  if (registration_enabled !== undefined) current.registration_enabled = !!registration_enabled;
  if (maintenance_mode !== undefined) current.maintenance_mode = !!maintenance_mode;
  
  const ok = settingsHelper.saveSettings(current);
  if (ok) {
    res.json({ message: 'System settings updated successfully.', settings: current });
  } else {
    res.status(500).json({ message: 'Error saving system settings.' });
  }
});

// 12. GET ALL SUPPORT TICKETS
router.get('/tickets', adminMiddleware, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM support_tickets ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Admin tickets query failed:', err.message);
    res.status(500).json({ message: 'Error retrieving support tickets.' });
  }
});

// 14. POST BULK ADJUST USERS (Balance & Daily Growth)
router.post('/users/bulk-adjust', adminMiddleware, async (req, res) => {
  const { userIds, balanceAdd, dailyGrowthAdd } = req.body;
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ message: 'No users selected.' });
  }

  try {
    await db.query(
      `UPDATE users SET 
       balance = balance + $1, 
       daily_growth = daily_growth + $2 
       WHERE id = ANY($3)`,
      [parseFloat(balanceAdd || 0), parseFloat(dailyGrowthAdd || 0), userIds]
    );
    res.json({ message: 'Bulk adjustments applied to selected users.' });
  } catch (err) {
    console.error('Bulk users adjustment failed:', err.message);
    res.status(500).json({ message: 'Error applying bulk user adjustments.' });
  }
});

// 15. POST BULK DELETE USERS
router.post('/users/bulk-delete', adminMiddleware, async (req, res) => {
  const { userIds } = req.body;
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ message: 'No users selected.' });
  }

  try {
    await db.query('DELETE FROM users WHERE id = ANY($1)', [userIds]);
    res.json({ message: 'Selected user profiles purged successfully.' });
  } catch (err) {
    console.error('Bulk users delete failed:', err.message);
    res.status(500).json({ message: 'Error purging selected user profiles.' });
  }
});

// 16. POST BULK WITHDRAWALS STATUS UPDATE
router.post('/withdrawals/bulk-status', adminMiddleware, async (req, res) => {
  const { withdrawalIds, status } = req.body; // status: 'Success' or 'Failed'
  if (!Array.isArray(withdrawalIds) || withdrawalIds.length === 0) {
    return res.status(400).json({ message: 'No withdrawals selected.' });
  }

  try {
    // If status is Failed, refund selected withdrawals that are NOT already failed
    if (status === 'Failed') {
      const pendingRes = await db.query(
        'SELECT id, user_id, amount, fee FROM withdrawals WHERE id = ANY($1) AND status != $2',
        [withdrawalIds, 'Failed']
      );
      
      for (const w of pendingRes.rows) {
        const totalRefund = parseFloat(w.amount) + parseFloat(w.fee);
        await db.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [totalRefund, w.user_id]);
      }
    }

    await db.query(
      'UPDATE withdrawals SET status = $1 WHERE id = ANY($2)',
      [status, withdrawalIds]
    );
    res.json({ message: 'Bulk status update successfully applied.' });
  } catch (err) {
    console.error('Bulk withdrawals status update failed:', err.message);
    res.status(500).json({ message: 'Error processing bulk withdrawals status update.' });
  }
});

// 17. POST BULK RESOLVE SUPPORT TICKETS
router.post('/tickets/bulk-resolve', adminMiddleware, async (req, res) => {
  const { ticketIds } = req.body;
  if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
    return res.status(400).json({ message: 'No tickets selected.' });
  }

  try {
    await db.query('DELETE FROM support_tickets WHERE id = ANY($1)', [ticketIds]);
    res.json({ message: 'Selected support tickets resolved and deleted.' });
  } catch (err) {
    console.error('Bulk tickets resolve failed:', err.message);
    res.status(500).json({ message: 'Error resolving selected support tickets.' });
  }
});

// 18. DELETE SUPPORT TICKET (Resolve)
router.delete('/tickets/:id', adminMiddleware, async (req, res) => {
  const ticketId = req.params.id;
  try {
    await db.query('DELETE FROM support_tickets WHERE id = $1', [ticketId]);
    res.json({ message: 'Support ticket resolved and deleted.' });
  } catch (err) {
    console.error('Admin ticket delete query failed:', err.message);
    res.status(500).json({ message: 'Error resolving support ticket.' });
  }
});

// 20. GET ALL MPESA & PAYBILL TRANSACTIONS
router.get('/mpesa-transactions', adminMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT m.*, u.username, u.phone AS user_phone, u.balance
       FROM mpesa_transactions m
       JOIN users u ON m.user_id = u.id
       ORDER BY m.id DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Admin M-Pesa transactions query failed:', err.message);
    res.status(500).json({ message: 'Error retrieving M-Pesa transactions ledger.' });
  }
});

// 21. POST APPROVE MPESA / PAYBILL TRANSACTION
router.post('/mpesa-transactions/:id/approve', adminMiddleware, async (req, res) => {
  const txId = req.params.id;

  try {
    const txQuery = await db.query('SELECT * FROM mpesa_transactions WHERE id = $1', [txId]);
    if (txQuery.rows.length === 0) {
      return res.status(404).json({ message: 'M-Pesa transaction record not found.' });
    }

    const tx = txQuery.rows[0];
    if (tx.status === 'Completed') {
      return res.status(400).json({ message: 'This transaction is already approved and completed.' });
    }

    // Begin DB transaction
    await db.query('BEGIN');

    // Update transaction status to Completed
    await db.query(
      'UPDATE mpesa_transactions SET status = \'Completed\', failure_reason = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [txId]
    );

    // Generate unique node ID
    const nodeId = 'Node #' + Math.floor(10 + Math.random() * 90);

    // Insert new active lease for the user
    const insertRes = await db.query(
      `INSERT INTO leases (user_id, node_id, name, type, status, speed, duration, remaining, cost, rate, daily_earnings, image)
       VALUES ($1, $2, $3, $4, 'Hashing', $5, $6, $6, $7, $8, $9, $10) RETURNING *`,
      [tx.user_id, nodeId, tx.name, tx.type, tx.speed, tx.duration, tx.cost, tx.rate, tx.daily_earnings, tx.image || '../public/images/blue_mainframe.png']
    );

    // Record rental transaction log
    await db.query(
      `INSERT INTO rent_transactions (user_id, lease_id, node_id, machine_name, amount)
       VALUES ($1, $2, $3, $4, $5)`,
      [tx.user_id, insertRes.rows[0].id, nodeId, tx.name, tx.cost]
    );

    // Update user's daily growth to the sum of all active leases
    const sumRes = await db.query(
      'SELECT COALESCE(SUM(daily_earnings), 0.00) AS total FROM leases WHERE user_id = $1 AND remaining > 0',
      [tx.user_id]
    );
    const totalDailyGrowth = parseFloat(sumRes.rows[0].total);
    await db.query('UPDATE users SET daily_growth = $1 WHERE id = $2', [totalDailyGrowth, tx.user_id]);

    await db.query('COMMIT');

    await logSystem(
      'info',
      `Admin approved M-Pesa transaction #${txId} (Code: ${tx.mpesa_code || tx.checkout_request_id}). Provisioned ${tx.name} to user ID ${tx.user_id}.`
    );

    res.json({
      success: true,
      message: `Transaction approved successfully. Machine ${tx.name} has been provisioned to the user.`,
      lease: insertRes.rows[0]
    });
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('Admin approve M-Pesa transaction failed:', err.message);
    res.status(500).json({ message: 'Error approving M-Pesa transaction: ' + err.message });
  }
});

// 22. POST REJECT MPESA / PAYBILL TRANSACTION
router.post('/mpesa-transactions/:id/reject', adminMiddleware, async (req, res) => {
  const txId = req.params.id;
  const { failure_reason } = req.body;
  const reason = failure_reason || 'Payment verification failed or receipt invalid.';

  try {
    const txQuery = await db.query('SELECT * FROM mpesa_transactions WHERE id = $1', [txId]);
    if (txQuery.rows.length === 0) {
      return res.status(404).json({ message: 'M-Pesa transaction record not found.' });
    }

    await db.query(
      'UPDATE mpesa_transactions SET status = \'Failed\', failure_reason = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [reason, txId]
    );

    await logSystem('warning', `Admin rejected M-Pesa transaction #${txId}. Reason: ${reason}`);

    res.json({ success: true, message: 'Transaction rejected successfully.' });
  } catch (err) {
    console.error('Admin reject M-Pesa transaction failed:', err.message);
    res.status(500).json({ message: 'Error rejecting M-Pesa transaction: ' + err.message });
  }
});

// 23. POST BULK APPROVE MPESA TRANSACTIONS
router.post('/mpesa-transactions/bulk-approve', adminMiddleware, async (req, res) => {
  const { transactionIds } = req.body;
  if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
    return res.status(400).json({ message: 'No transactions selected.' });
  }

  let approvedCount = 0;
  for (const id of transactionIds) {
    try {
      const txQuery = await db.query('SELECT * FROM mpesa_transactions WHERE id = $1 AND status != \'Completed\'', [id]);
      if (txQuery.rows.length > 0) {
        const tx = txQuery.rows[0];
        await db.query('BEGIN');
        await db.query('UPDATE mpesa_transactions SET status = \'Completed\', failure_reason = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
        const nodeId = 'Node #' + Math.floor(10 + Math.random() * 90);
        const insertRes = await db.query(
          `INSERT INTO leases (user_id, node_id, name, type, status, speed, duration, remaining, cost, rate, daily_earnings, image)
           VALUES ($1, $2, $3, $4, 'Hashing', $5, $6, $6, $7, $8, $9, $10) RETURNING *`,
          [tx.user_id, nodeId, tx.name, tx.type, tx.speed, tx.duration, tx.cost, tx.rate, tx.daily_earnings, tx.image || '../public/images/blue_mainframe.png']
        );
        await db.query(
          `INSERT INTO rent_transactions (user_id, lease_id, node_id, machine_name, amount) VALUES ($1, $2, $3, $4, $5)`,
          [tx.user_id, insertRes.rows[0].id, nodeId, tx.name, tx.cost]
        );
        const sumRes = await db.query('SELECT COALESCE(SUM(daily_earnings), 0.00) AS total FROM leases WHERE user_id = $1 AND remaining > 0', [tx.user_id]);
        await db.query('UPDATE users SET daily_growth = $1 WHERE id = $2', [parseFloat(sumRes.rows[0].total), tx.user_id]);
        await db.query('COMMIT');
        approvedCount++;
      }
    } catch (e) {
      await db.query('ROLLBACK').catch(() => {});
      console.error(`Bulk approve error for ID ${id}:`, e.message);
    }
  }

  res.json({ message: `Successfully approved ${approvedCount} transaction(s).` });
});

// 25. GET ALL MINING MACHINES (Admin View)
router.get('/machines', adminMiddleware, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM machines ORDER BY sort_order ASC, id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Admin get machines failed:', err.message);
    res.status(500).json({ message: 'Error retrieving mining machines catalog.' });
  }
});

// 26. POST UPLOAD MACHINE IMAGE
router.post('/machines/upload-image', adminMiddleware, (req, res) => {
  uploadMachineImage.single('image')(req, res, (err) => {
    if (err) {
      console.error('Image upload error:', err.message);
      return res.status(400).json({ message: err.message || 'Image upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided.' });
    }
    const publicUrl = '/public/uploads/machines/' + req.file.filename;
    res.json({
      success: true,
      message: 'Machine image uploaded successfully.',
      url: publicUrl,
      filename: req.file.filename
    });
  });
});

// 27. POST CREATE NEW MINING MACHINE
router.post('/machines', adminMiddleware, async (req, res) => {
  const {
    name,
    slug,
    tagline,
    price,
    daily_income,
    duration_days,
    total_profit,
    speed,
    slots_total,
    slots_taken,
    badge,
    image,
    status,
    sort_order
  } = req.body;

  if (!name || price === undefined || daily_income === undefined) {
    return res.status(400).json({ message: 'Machine Name, Price, and Daily Income are required.' });
  }

  const machineSlug = slug && slug.trim() 
    ? slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') 
    : name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const priceVal = parseFloat(price);
  const dailyIncomeVal = parseFloat(daily_income);
  const durationVal = parseInt(duration_days) || 30;
  const totalProfitVal = total_profit !== undefined && total_profit !== '' ? parseFloat(total_profit) : (dailyIncomeVal * durationVal);
  const slotsTotalVal = slots_total ? parseInt(slots_total) : 50;
  const slotsTakenVal = slots_taken ? parseInt(slots_taken) : 0;
  const sortOrderVal = sort_order ? parseInt(sort_order) : 1;

  try {
    const insertRes = await db.query(
      `INSERT INTO machines (
        slug, name, tagline, price, daily_income, duration_days, total_profit,
        speed, slots_total, slots_taken, badge, image, status, sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        machineSlug,
        name.trim(),
        tagline || '',
        priceVal,
        dailyIncomeVal,
        durationVal,
        totalProfitVal,
        speed || '50 MH/s',
        slotsTotalVal,
        slotsTakenVal,
        badge || '',
        image || 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=800&q=80',
        status || 'Active',
        sortOrderVal
      ]
    );

    await logSystem('info', `Admin created new mining machine "${name}" (Slug: ${machineSlug}, Price: KSh ${priceVal}).`);
    res.json({
      success: true,
      message: 'Mining machine created successfully.',
      machine: insertRes.rows[0]
    });
  } catch (err) {
    console.error('Admin create machine failed:', err.message);
    if (err.code === '23505') {
      return res.status(400).json({ message: `A machine with slug "${machineSlug}" already exists. Please choose a different name or slug.` });
    }
    res.status(500).json({ message: 'Error creating mining machine: ' + err.message });
  }
});

// 28. PUT UPDATE MINING MACHINE
router.put('/machines/:id', adminMiddleware, async (req, res) => {
  const machineId = req.params.id;
  const {
    name,
    slug,
    tagline,
    price,
    daily_income,
    duration_days,
    total_profit,
    speed,
    slots_total,
    slots_taken,
    badge,
    image,
    status,
    sort_order
  } = req.body;

  try {
    const existing = await db.query('SELECT * FROM machines WHERE id = $1', [machineId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Mining machine not found.' });
    }

    const current = existing.rows[0];
    const newName = name !== undefined ? name.trim() : current.name;
    const newSlug = slug !== undefined && slug.trim() 
      ? slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') 
      : (name !== undefined ? name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : current.slug);
    const newTagline = tagline !== undefined ? tagline : current.tagline;
    const newPrice = price !== undefined ? parseFloat(price) : current.price;
    const newDailyIncome = daily_income !== undefined ? parseFloat(daily_income) : current.daily_income;
    const newDuration = duration_days !== undefined ? parseInt(duration_days) : current.duration_days;
    const newTotalProfit = total_profit !== undefined && total_profit !== '' ? parseFloat(total_profit) : (newDailyIncome * newDuration);
    const newSpeed = speed !== undefined ? speed : current.speed;
    const newSlotsTotal = slots_total !== undefined ? parseInt(slots_total) : current.slots_total;
    const newSlotsTaken = slots_taken !== undefined ? parseInt(slots_taken) : current.slots_taken;
    const newBadge = badge !== undefined ? badge : current.badge;
    const newImage = image !== undefined ? image : current.image;
    const newStatus = status !== undefined ? status : current.status;
    const newSortOrder = sort_order !== undefined ? parseInt(sort_order) : current.sort_order;

    const updateRes = await db.query(
      `UPDATE machines SET 
        name = $1,
        slug = $2,
        tagline = $3,
        price = $4,
        daily_income = $5,
        duration_days = $6,
        total_profit = $7,
        speed = $8,
        slots_total = $9,
        slots_taken = $10,
        badge = $11,
        image = $12,
        status = $13,
        sort_order = $14,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $15
       RETURNING *`,
      [
        newName,
        newSlug,
        newTagline,
        newPrice,
        newDailyIncome,
        newDuration,
        newTotalProfit,
        newSpeed,
        newSlotsTotal,
        newSlotsTaken,
        newBadge,
        newImage,
        newStatus,
        newSortOrder,
        machineId
      ]
    );

    await logSystem('info', `Admin updated mining machine #${machineId} (${newName}).`);
    res.json({
      success: true,
      message: 'Mining machine updated successfully.',
      machine: updateRes.rows[0]
    });
  } catch (err) {
    console.error('Admin update machine failed:', err.message);
    if (err.code === '23505') {
      return res.status(400).json({ message: 'Another machine with this slug already exists.' });
    }
    res.status(500).json({ message: 'Error updating machine: ' + err.message });
  }
});

// 29. DELETE MINING MACHINE
router.delete('/machines/:id', adminMiddleware, async (req, res) => {
  const machineId = req.params.id;
  try {
    const existing = await db.query('SELECT * FROM machines WHERE id = $1', [machineId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Mining machine not found.' });
    }

    await db.query('DELETE FROM machines WHERE id = $1', [machineId]);
    await logSystem('warning', `Admin deleted mining machine #${machineId} (${existing.rows[0].name}).`);
    res.json({ success: true, message: `Machine "${existing.rows[0].name}" was deleted successfully.` });
  } catch (err) {
    console.error('Admin delete machine failed:', err.message);
    res.status(500).json({ message: 'Error deleting machine: ' + err.message });
  }
});

module.exports = router;
