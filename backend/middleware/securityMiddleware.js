const rateLimit = require('express-rate-limit');
const { logSystem } = require('../config/logger');

/**
 * XM Digital - Comprehensive Brute Force & Rate Limit Security Shield
 */

// 1. Whole Website Global Limiter (Protects against DDoS, scanners, and floods)
const globalSiteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 600, // Limit each IP to 600 requests per 15 mins across all routes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too Many Requests',
    message: 'Global traffic limit reached for this IP. Please wait a few moments and try again.'
  },
  skip: (req) => {
    // Skip static assets (images, CSS, JS bundles) from rate count
    const p = req.path;
    return p.startsWith('/public/uploads/') || p.endsWith('.css') || p.endsWith('.js') || p.endsWith('.png') || p.endsWith('.jpg') || p.endsWith('.svg');
  }
});

// 2. User Authentication Brute-Force Shield (Login & Registration)
const authBruteForceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 failed login/registration attempts per 15 mins
  skipSuccessfulRequests: true, // Do NOT count successful logins against legitimate users
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logSystem('warn', `🛡️ Brute-force protection: IP ${clientIp} temporarily locked out after 10 failed authentication attempts.`);
    res.status(429).json({
      success: false,
      error: 'Security Lockout',
      message: 'Too many failed login attempts from your IP. Access is temporarily locked for 15 minutes to protect your account.'
    });
  }
});

// 3. Ultra-Strict Admin PIN Brute-Force Shield
const adminPinBruteForceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Strict max 5 failed PIN attempts per IP
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logSystem('warn', `🚨 CRITICAL SECURITY ALERT: Multiple unauthorized admin PIN attempts detected from IP ${clientIp}. Admin gateway locked for 15 minutes.`);
    res.status(429).json({
      success: false,
      error: 'Admin Gateway Lockout',
      message: 'Multiple incorrect security PIN attempts. Administrative gateway is locked for 15 minutes for security.'
    });
  }
});

// 4. Contact & Support Message Spam Shield
const contactSpamLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // Max 5 ticket submissions per 10 mins
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Submission Rate Limit',
    message: 'You have submitted several support tickets recently. Please wait a few minutes before sending another message.'
  }
});

// 5. User Financial / Transactions Limiter (Withdrawals & Machine Rentals)
const transactionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // Max 20 requests per 5 mins
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Transaction Rate Limit',
    message: 'Too many financial operations initiated in a short period. Please wait 5 minutes.'
  }
});

module.exports = {
  globalSiteLimiter,
  authBruteForceLimiter,
  adminPinBruteForceLimiter,
  contactSpamLimiter,
  transactionLimiter
};
