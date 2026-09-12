const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 1. GET ALL ACTIVE MACHINES (For Dashboard & Catalog Display)
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM machines 
       WHERE status != 'Hidden' 
       ORDER BY sort_order ASC, id ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching machine catalog:', err.message);
    res.status(500).json({ message: 'Error retrieving machine catalog.' });
  }
});

// 2. GET SINGLE MACHINE BY SLUG OR ID
router.get('/:identifier', async (req, res) => {
  const { identifier } = req.params;
  try {
    let result;
    if (!isNaN(identifier)) {
      result = await db.query('SELECT * FROM machines WHERE id = $1', [parseInt(identifier)]);
    } else {
      result = await db.query('SELECT * FROM machines WHERE slug = $1', [identifier.toLowerCase()]);
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Mining machine not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching machine details:', err.message);
    res.status(500).json({ message: 'Error retrieving machine details.' });
  }
});

module.exports = router;
