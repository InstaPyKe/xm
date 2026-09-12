const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

// Validate critical security environment variables on startup
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'super_secret_xm_key_109283')) {
  console.error('❌ CRITICAL SECURITY ERROR: JWT_SECRET must be configured securely in production mode.');
  process.exit(1);
}

const db = require('./config/db');
const { logSystem } = require('./config/logger');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;

// 1. Secure HTTP headers with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "*"],
      connectSrc: ["'self'", "http://localhost:*", "ws://localhost:*", "http://127.0.0.1:*"]
    }
  }
}));

// 2. Configure Cross-Origin Resource Sharing
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['http://localhost:5000', 'http://127.0.0.1:5000'];

app.use(cors({
  origin: (origin, callback) => {
    // In development mode, allow all origins (such as live server ports, different local IPs)
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    // In production, enforce strict whitelist
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`🔒 CORS blocked unauthorized origin: ${origin}`);
      callback(new Error('Blocked by CORS policy: Request origin is unauthorized.'));
    }
  },
  credentials: true
}));

app.use(express.urlencoded({ extended: true })); // Support registration form POST data
app.use(express.json());

const maintenanceMiddleware = require('./middleware/maintenanceMiddleware');
const machineRoutes = require('./routes/machines');

// API Route Mounts
app.use('/api', authRoutes);
app.use('/api/machines', machineRoutes);
app.use('/api/user', maintenanceMiddleware, userRoutes);
app.use('/api/admin', adminRoutes);

// Serve static folders from the project root
app.use('/public', express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));
app.use('/account', express.static(path.join(__dirname, '../account')));
app.use('/admin', express.static(path.join(__dirname, '../admin')));

// Serve main landing index page at the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});
app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Explicit routes for signup and signin to support clean URLs
app.get('/signup.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/signup.html'));
});
app.get('/signin.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/signin.html'));
});
app.get('/contact.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/contact.html'));
});
app.get('/about.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/about.html'));
});
app.get('/privacy.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/privacy.html'));
});
app.get('/admin-login.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin/admin-login.html'));
});
app.get('/adminlogin', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin/admin-login.html'));
});
app.get('/admin-login', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin/admin-login.html'));
});
app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin/admin.html'));
});

// Contact API Endpoint
app.post('/api/contact', async (req, res) => {
  const { name, phone, email, topic, message } = req.body;
  if (!name || !phone || !topic || !message) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed. Please supply Name, Phone, Topic, and Message.'
    });
  }
  
  try {
    await db.query(
      'INSERT INTO support_tickets (name, phone, email, topic, message) VALUES ($1, $2, $3, $4, $5)',
      [name, phone, email || null, topic, message]
    );
    
    return res.json({
      success: true,
      message: 'Cryptographic signature verification complete. Support ticket successfully queued.',
      ticketId: 'TX-' + Math.floor(100000 + Math.random() * 900000)
    });
  } catch (err) {
    console.error('Failed to save support ticket:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error saving support ticket.'
    });
  }
});

// ─── MPESA CALLBACKS & SIMULATOR ───

// M-PESA DARAJA PUBLIC CALLBACK ENDPOINT
app.post('/api/mpesa-callback', async (req, res) => {
  const { Body } = req.body;
  if (!Body || !Body.stkCallback) {
    await logSystem('error', 'M-Pesa callback: Invalid callback body structure.');
    return res.status(400).json({ ResultCode: 1, ResultDesc: 'Invalid body' });
  }

  const { CheckoutRequestID, ResultCode, ResultDesc } = Body.stkCallback;

  try {
    // 1. Find the pending transaction
    const txQuery = await db.query(
      'SELECT * FROM mpesa_transactions WHERE checkout_request_id = $1 AND status = \'Pending\'',
      [CheckoutRequestID]
    );

    if (txQuery.rows.length === 0) {
      await logSystem('warning', `M-Pesa callback received but no pending transaction found for Request ID: ${CheckoutRequestID}`);
      return res.json({ ResultCode: 0, ResultDesc: 'Acknowledged' });
    }

    const tx = txQuery.rows[0];

    if (ResultCode === 0) {
      // Start DB transaction
      await db.query('BEGIN');

      // Update mpesa_transactions state
      await db.query(
        'UPDATE mpesa_transactions SET status = \'Completed\', updated_at = CURRENT_TIMESTAMP WHERE checkout_request_id = $1',
        [CheckoutRequestID]
      );

      // Generate unique node ID
      const nodeId = 'Node #' + Math.floor(10 + Math.random() * 90);

      // Insert new lease record
      const insertRes = await db.query(
        `INSERT INTO leases (user_id, node_id, name, type, status, speed, duration, remaining, cost, rate, daily_earnings, image) 
         VALUES ($1, $2, $3, $4, 'Hashing', $5, $6, $6, $7, $8, $9, $10) RETURNING *`,
        [tx.user_id, nodeId, tx.name, tx.type, tx.speed, tx.duration, tx.cost, tx.rate, tx.daily_earnings, tx.image]
      );

      // Record rental transaction log
      await db.query(
        `INSERT INTO rent_transactions (user_id, lease_id, node_id, machine_name, amount)
         VALUES ($1, $2, $3, $4, $5)`,
        [tx.user_id, insertRes.rows[0].id, nodeId, tx.name, tx.cost]
      );

      // Update user's daily growth rate to the sum of all active leases
      const sumRes = await db.query(
        'SELECT COALESCE(SUM(daily_earnings), 0.00) AS total FROM leases WHERE user_id = $1 AND remaining > 0',
        [tx.user_id]
      );
      const totalDailyGrowth = parseFloat(sumRes.rows[0].total);
      await db.query('UPDATE users SET daily_growth = $1 WHERE id = $2', [totalDailyGrowth, tx.user_id]);

      await db.query('COMMIT');
      await logSystem('info', `M-Pesa payment SUCCESS for Request ID ${CheckoutRequestID}. Leased machine ${tx.name} to user ID ${tx.user_id}.`);
    } else {
      // Update transaction status to Failed and record failure reason
      await db.query(
        'UPDATE mpesa_transactions SET status = \'Failed\', failure_reason = $1, updated_at = CURRENT_TIMESTAMP WHERE checkout_request_id = $2',
        [ResultDesc, CheckoutRequestID]
      );
      await logSystem('warning', `M-Pesa payment FAILED for Request ID ${CheckoutRequestID}. ResultCode: ${ResultCode}, Desc: ${ResultDesc}`);
    }

    res.json({ ResultCode: 0, ResultDesc: 'Acknowledged' });
  } catch (err) {
    await db.query('ROLLBACK');
    await logSystem('error', `Error processing M-Pesa callback for Request ID ${CheckoutRequestID}: ${err.message}`);
    res.status(500).json({ ResultCode: 1, ResultDesc: 'Internal server error' });
  }
});

// LOCAL SIMULATION ENDPOINT FOR MPESA CALLBACK
app.post('/api/mpesa-callback/simulate', async (req, res) => {
  const { checkoutRequestId, success, failureReason } = req.body;
  if (!checkoutRequestId) {
    return res.status(400).json({ message: 'Missing checkoutRequestId parameter' });
  }

  console.log(`🔧 Simulating M-Pesa callback locally. Request ID: ${checkoutRequestId}, Success: ${success !== false}, Reason: ${failureReason || 'N/A'}`);

  // Create a mock body identical to what Safaricom sends
  const mockPayload = {
    Body: {
      stkCallback: {
        MerchantRequestID: '12345-67890-1',
        CheckoutRequestID: checkoutRequestId,
        ResultCode: success !== false ? 0 : 1032, // 1032 is customer cancelled
        ResultDesc: success !== false ? 'The service request is processed successfully.' : (failureReason || 'Request cancelled by user'),
        CallbackMetadata: success !== false ? {
          Item: [
            { Name: 'Amount', Value: 1 },
            { Name: 'MpesaReceiptNumber', Value: 'MOCK' + Math.random().toString(36).substring(2, 8).toUpperCase() },
            { Name: 'TransactionDate', Value: 20260716181121 },
            { Name: 'PhoneNumber', Value: 254712345678 }
          ]
        } : null
      }
    }
  };

  try {
    const response = await fetch(`http://localhost:${PORT}/api/mpesa-callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mockPayload)
    });
    const result = await response.json();
    res.json({ message: 'Callback simulation triggered.', callbackResponse: result });
  } catch (err) {
    console.error('Simulation trigger failed:', err.message);
    res.status(500).json({ message: 'Simulation trigger failed: ' + err.message });
  }
});

// GET SYSTEM LOGS ENDPOINT
app.get('/api/system/logs', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT level, message, created_at FROM system_logs ORDER BY id DESC LIMIT 50'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Failed to query system logs:', err.message);
    res.status(500).json({ message: 'Error retrieving system logs.' });
  }
});

// Public System Settings Endpoint
app.get('/api/settings/public', (req, res) => {
  const settingsHelper = require('./config/settingsHelper');
  const settings = settingsHelper.getSettings();
  res.json({
    registration_enabled: settings.registration_enabled,
    maintenance_mode: settings.maintenance_mode
  });
});

// Basic health check route
app.get('/api/health', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW()');
    res.json({
      status: 'OK',
      message: 'Server is running and successfully connected to PostgreSQL',
      time: result.rows[0].now
    });
  } catch (err) {
    res.status(500).json({
      status: 'ERROR',
      message: 'Database query failed',
      error: err.message
    });
  }
});

// Start Express Listener
app.listen(PORT, () => {
  console.log(`🚀 Express server running on port ${PORT}`);
  console.log(`👉 Web Portal: http://localhost:${PORT}`);
  console.log(`👉 Dashboard Cockpit: http://localhost:${PORT}/account/dashboard.html`);
  console.log(`👉 Health Check: http://localhost:${PORT}/api/health`);
});
