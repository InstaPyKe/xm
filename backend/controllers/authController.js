const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { logSystem } = require('../config/logger');
require('dotenv').config();

// 1. REGISTRATION (Browser Form redirect handler)
exports.register = async (req, res) => {
  const settingsHelper = require('../config/settingsHelper');
  const settings = settingsHelper.getSettings();
  if (!settings.registration_enabled) {
    return res.status(403).send('New user registration is currently disabled by system administrators.');
  }

  const { username, email, password, referral } = req.body;
  
  if (!username || !email || !password) {
    return res.status(400).send('All registration fields (Username, Email, Password) are required.');
  }

  if (password.length < 8) {
    return res.status(400).send('Security Requirement: Password must be at least 8 characters long.');
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    // Check if email already registered
    const userCheck = await db.query('SELECT * FROM users WHERE email = $1', [cleanEmail]);
    if (userCheck.rows.length > 0) {
      return res.status(400).send('Email address already registered. Please go to Sign In.');
    }

    // Hash the password securely
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Process 1-level referral system (Reward referrer with KSh 200)
    let referrerCode = referral ? referral.trim() : null;
    if (referrerCode) {
      const referrerCheck = await db.query(
        'SELECT id, username, email FROM users WHERE email = $1 OR username = $2',
        [referrerCode.toLowerCase(), referrerCode]
      );
      if (referrerCheck.rows.length > 0) {
        const referrer = referrerCheck.rows[0];
        // Credit 200 KSh/USDT to the referrer's balance
        await db.query('UPDATE users SET balance = balance + 200.00 WHERE id = $1', [referrer.id]);
        console.log(`🎁 Referral reward of KSh 200 credited to ${referrer.username} (ID: ${referrer.id}) for inviting ${username}`);
        referrerCode = referrer.email; // Save standard email identifier
      } else {
        referrerCode = null; // Ignore invalid referral code
      }
    }

    // Insert user record into PostgreSQL
    await db.query(
      'INSERT INTO users (username, email, password, referral, balance) VALUES ($1, $2, $3, $4, 0.00)',
      [username, cleanEmail, hashedPassword, referrerCode]
    );

    await logSystem('info', `New user registered: ${username} (${cleanEmail})`);

    // Registration success -> Redirect browser to clean sign-in portal
    res.redirect('/signin.html?registered=true');
  } catch (err) {
    await logSystem('error', `Registration failed for ${username} (${cleanEmail}): ${err.message}`);
    res.status(500).send('System registration failed. Please try again.');
  }
};

// 2. LOGIN (AJAX JSON endpoint returning JWT bearer token)
exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password required.' });
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    // Find user by email
    const result = await db.query('SELECT * FROM users WHERE email = $1', [cleanEmail]);
    if (result.rows.length === 0) {
      await logSystem('warning', `Failed login attempt for unrecognized email: ${cleanEmail}`);
      return res.status(401).json({ message: 'Invalid email address or password credentials.' });
    }

    const user = result.rows[0];

    // Verify hashed password comparison
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await logSystem('warning', `Failed login attempt for user: ${user.username} (${cleanEmail}) - Incorrect password`);
      return res.status(401).json({ message: 'Invalid email address or password credentials.' });
    }

    // Sign session token
    const token = jwt.sign(
      { userId: user.id }, 
      process.env.JWT_SECRET || 'fallback_key', 
      { expiresIn: '7d' }
    );

    await logSystem('info', `User logged in successfully: ${user.username} (${cleanEmail})`);

    res.json({
      token,
      username: user.username,
      message: 'Authentication successful.'
    });
  } catch (err) {
    await logSystem('error', `Login error for ${cleanEmail}: ${err.message}`);
    res.status(500).json({ message: 'Authentication process encountered an error.' });
  }
};
