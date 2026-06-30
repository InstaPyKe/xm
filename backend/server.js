const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const db = require('./config/db');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.urlencoded({ extended: true })); // Support registration form POST data
app.use(express.json());

// API Route Mounts
app.use('/api', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);

// Serve static folders from the project root
app.use('/public', express.static(path.join(__dirname, '../public')));
app.use('/account', express.static(path.join(__dirname, '../account')));
app.use('/admin', express.static(path.join(__dirname, '../admin')));

// Serve main landing index page at the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Explicit routes for signup and signin to support clean URLs
app.get('/signup.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/signup.html'));
});
app.get('/signin.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/signin.html'));
});
app.get('/admin-login.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin/admin-login.html'));
});
app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin/admin.html'));
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
