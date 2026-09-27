const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authBruteForceLimiter } = require('../middleware/securityMiddleware');
const maintenanceMiddleware = require('../middleware/maintenanceMiddleware');

// 1. REGISTRATION (With Brute Force Shield)
router.post('/register', authBruteForceLimiter, authController.register);

// 2. LOGIN (With Brute Force Shield & Maintenance Check)
router.post('/login', authBruteForceLimiter, maintenanceMiddleware, authController.login);

module.exports = router;

