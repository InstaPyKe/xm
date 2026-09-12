const db = require('./db');

async function logSystem(level, message) {
  const formattedMsg = `[${level.toUpperCase()}] ${message}`;
  console.log(formattedMsg);
  try {
    await db.query(
      'INSERT INTO system_logs (level, message) VALUES ($1, $2)',
      [level, message]
    );
  } catch (err) {
    console.error('❌ Failed to write log to database:', err.message);
  }
}

module.exports = { logSystem };
