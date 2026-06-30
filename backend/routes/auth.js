const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// 1. REGISTRATION (Form Submit target redirecting browser)
router.post('/register', authController.register);

// 2. LOGIN (AJAX JSON receiver)
router.post('/login', authController.login);

module.exports = router;
