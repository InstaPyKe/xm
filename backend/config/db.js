const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Railway and other cloud hosts provide DATABASE_URL or DATABASE_PUBLIC_URL
const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;
const isProduction = process.env.NODE_ENV === 'production' || !!databaseUrl;

// Determine SSL requirement for cloud database connections
let sslConfig = false;
if (process.env.DB_SSL === 'true' || (isProduction && process.env.DB_SSL !== 'false' && databaseUrl)) {
  sslConfig = { rejectUnauthorized: false };
}

const poolConfig = databaseUrl
  ? {
      connectionString: databaseUrl,
      ssl: sslConfig,
      max: parseInt(process.env.DB_POOL_MAX || '20', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    }
  : {
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'walmart',
      password: String(process.env.DB_PASSWORD || ''),
      port: parseInt(process.env.DB_PORT || '5432', 10),
      ssl: sslConfig,
      max: parseInt(process.env.DB_POOL_MAX || '20', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

const pool = new Pool(poolConfig);

// Handle idle connection errors gracefully without crashing the server
pool.on('error', (err) => {
  console.error('⚠️ Unexpected idle PostgreSQL client error:', err.message);
});

// Verify connection immediately on startup
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
  } else {
    console.log('✅ PostgreSQL Database connected successfully. Server time:', res.rows[0].now);
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
