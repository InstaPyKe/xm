const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
require('dotenv').config();

// 1. REGISTRATION (Browser Form redirect handler)
exports.register = async (req, res) => {
  const { username, countryCode, phone, password, referral } = req.body;
  
  if (!username || !countryCode || !phone || !password) {
    return res.status(400).send('All registration fields are required.');
  }

  // Combine selector code and phone number digits
  const fullPhone = (countryCode + phone).replace(/\s+/g, '');

  try {
    // Check if phone number already registered
    const userCheck = await db.query('SELECT * FROM users WHERE phone = $1', [fullPhone]);
    if (userCheck.rows.length > 0) {
      return res.status(400).send('Phone number already registered. Please go to Sign In.');
    }

    // Hash the password securely
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Process 1-level referral system (Reward referrer with KSh 200)
    let referrerCode = referral ? referral.trim() : null;
    if (referrerCode) {
      const referrerCheck = await db.query(
        'SELECT id, username, phone FROM users WHERE phone = $1 OR username = $2',
        [referrerCode, referrerCode]
      );
      if (referrerCheck.rows.length > 0) {
        const referrer = referrerCheck.rows[0];
        // Credit 200 KSh/USDT to the referrer's balance
        await db.query('UPDATE users SET balance = balance + 200.00 WHERE id = $1', [referrer.id]);
        console.log(`🎁 Referral reward of KSh 200 credited to ${referrer.username} (ID: ${referrer.id}) for inviting ${username}`);
        referrerCode = referrer.phone; // Save standard phone identifier
      } else {
        referrerCode = null; // Ignore invalid referral code
      }
    }

    // Insert user record into PostgreSQL
    await db.query(
      'INSERT INTO users (username, phone, password, referral, balance) VALUES ($1, $2, $3, $4, 0.00)',
      [username, fullPhone, hashedPassword, referrerCode]
    );

    // Registration success -> Redirect browser to sign-in portal
    res.redirect('/public/signin.html?registered=true');
  } catch (err) {
    console.error('Registration Error:', err.message);
    res.status(500).send('System registration failed. Please try again.');
  }
};

// 2. LOGIN (AJAX JSON endpoint returning JWT bearer token)
exports.login = async (req, res) => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    return res.status(400).json({ message: 'Phone number and password required.' });
  }

  const cleanPhone = phone.replace(/\s+/g, '');

  try {
    // Find user by phone
    const result = await db.query('SELECT * FROM users WHERE phone = $1', [cleanPhone]);
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid phone number or password credentials.' });
    }

    const user = result.rows[0];

    // Verify hashed password comparison
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid phone number or password credentials.' });
    }

    // Sign session token
    const token = jwt.sign(
      { userId: user.id }, 
      process.env.JWT_SECRET || 'fallback_key', 
      { expiresIn: '7d' }
    );

    res.json({
      token,
      username: user.username,
      message: 'Authentication successful.'
    });
  } catch (err) {
    console.error('Login Error:', err.message);
    res.status(500).json({ message: 'Authentication process encountered an error.' });
  }
};
