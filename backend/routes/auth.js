const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const rateLimiter = require('../middleware/rateLimitMiddleware');

// Limit authorization & validation attempts: max 5 requests per 60 seconds
const authRateLimit = rateLimiter(5, 60000);

// 1. REGISTRATION (Form Submit target redirecting browser)
router.post('/register', authRateLimit, authController.register);

const maintenanceMiddleware = require('../middleware/maintenanceMiddleware');

// 2. LOGIN (AJAX JSON receiver)
router.post('/login', authRateLimit, maintenanceMiddleware, authController.login);

module.exports = router;
