-- PostgreSQL database schema for XM Digital Console

-- 1. DROP TABLES IF THEY EXIST (for clean re-runs)
DROP TABLE IF EXISTS withdrawals CASCADE;
DROP TABLE IF EXISTS yield_history CASCADE;
DROP TABLE IF EXISTS leases CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 2. CREATE USERS TABLE
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    phone VARCHAR(50) UNIQUE NOT NULL, -- Format: +254700000000
    password VARCHAR(255) NOT NULL,
    referral VARCHAR(100),
    balance NUMERIC(15, 2) DEFAULT 0.00,
    leased_earnings NUMERIC(15, 2) DEFAULT 0.00,
    daily_growth NUMERIC(15, 2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. CREATE LEASES TABLE
CREATE TABLE leases (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    node_id VARCHAR(50) NOT NULL, -- e.g., 'Node #01'
    name VARCHAR(150) NOT NULL, -- e.g., 'Quantum Edge V1'
    type VARCHAR(50) NOT NULL, -- e.g., 'volt', 'pulse', 'quantum', 'aero', 'hyperion', 'solar', 'ocean', 'aurora', 'nebula', 'apex'
    status VARCHAR(50) NOT NULL DEFAULT 'Hashing',
    speed VARCHAR(50) NOT NULL, -- e.g., '48.5 MH/s'
    duration INT NOT NULL DEFAULT 14,
    remaining INT NOT NULL DEFAULT 14,
    cost NUMERIC(15, 2) NOT NULL,
    rate NUMERIC(5, 2) NOT NULL DEFAULT 3.0,
    daily_earnings NUMERIC(15, 2) NOT NULL DEFAULT 0.0,
    image VARCHAR(255),
    last_yield_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. CREATE YIELD HISTORY TABLE (For ApexCharts Graph logs)
CREATE TABLE yield_history (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(15, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. CREATE WITHDRAWALS LEDGER TABLE
CREATE TABLE withdrawals (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    reference VARCHAR(100) UNIQUE NOT NULL, -- e.g., 'REF-512984'
    amount NUMERIC(15, 2) NOT NULL,
    fee NUMERIC(15, 2) NOT NULL,
    channel VARCHAR(100) NOT NULL, -- 'MPESA', 'AIRTEL', 'BANK'
    destination VARCHAR(255) NOT NULL, -- destination phone or account
    status VARCHAR(50) NOT NULL DEFAULT 'Success',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. SEED MOCK USER & LEASES FOR TESTING (Password is: bravin123)
-- The password hash here corresponds to bcrypt value of 'bravin123'
INSERT INTO users (id, username, phone, password, referral, balance, leased_earnings, daily_growth)
VALUES (
    1, 
    'bravin_miner', 
    '+254700000000', 
    '$2a$10$wE8wY01YfM/vBqD.hE6ZFeUqA6H5oZlpxG0lT7y2Kz2J44C2bFRe.', 
    'XM-STARTER-REF', 
    192783.50, 
    405652.00, 
    5863.00
);

INSERT INTO leases (user_id, node_id, name, type, status, speed, duration, remaining, cost, rate, daily_earnings, image)
VALUES 
(1, 'Node #01', 'Volt Hashing Node (V1)', 'volt', 'Hashing', '10.0 MH/s', 14, 10, 3000.00, 3.00, 90.00, '../public/images/blue_mainframe.png');

-- 7. SEED 30 DAYS OF HISTORICAL YIELD ENTRIES (For Graph curves)
INSERT INTO yield_history (user_id, amount, created_at) VALUES
(1, 4100.00, CURRENT_TIMESTAMP - INTERVAL '30 days'),
(1, 4300.00, CURRENT_TIMESTAMP - INTERVAL '29 days'),
(1, 4200.00, CURRENT_TIMESTAMP - INTERVAL '28 days'),
(1, 4500.00, CURRENT_TIMESTAMP - INTERVAL '27 days'),
(1, 4600.00, CURRENT_TIMESTAMP - INTERVAL '26 days'),
(1, 4800.00, CURRENT_TIMESTAMP - INTERVAL '25 days'),
(1, 5100.00, CURRENT_TIMESTAMP - INTERVAL '24 days'),
(1, 4900.00, CURRENT_TIMESTAMP - INTERVAL '23 days'),
(1, 5000.00, CURRENT_TIMESTAMP - INTERVAL '22 days'),
(1, 5200.00, CURRENT_TIMESTAMP - INTERVAL '21 days'),
(1, 5500.00, CURRENT_TIMESTAMP - INTERVAL '20 days'),
(1, 5300.00, CURRENT_TIMESTAMP - INTERVAL '19 days'),
(1, 5400.00, CURRENT_TIMESTAMP - INTERVAL '18 days'),
(1, 5600.00, CURRENT_TIMESTAMP - INTERVAL '17 days'),
(1, 5800.00, CURRENT_TIMESTAMP - INTERVAL '16 days'),
(1, 5900.00, CURRENT_TIMESTAMP - INTERVAL '15 days'),
(1, 5700.00, CURRENT_TIMESTAMP - INTERVAL '14 days'),
(1, 6000.00, CURRENT_TIMESTAMP - INTERVAL '13 days'),
(1, 6200.00, CURRENT_TIMESTAMP - INTERVAL '12 days'),
(1, 6100.00, CURRENT_TIMESTAMP - INTERVAL '11 days'),
(1, 6300.00, CURRENT_TIMESTAMP - INTERVAL '10 days'),
(1, 6400.00, CURRENT_TIMESTAMP - INTERVAL '9 days'),
(1, 6500.00, CURRENT_TIMESTAMP - INTERVAL '8 days'),
(1, 6700.00, CURRENT_TIMESTAMP - INTERVAL '7 days'),
(1, 6600.00, CURRENT_TIMESTAMP - INTERVAL '6 days'),
(1, 6800.00, CURRENT_TIMESTAMP - INTERVAL '5 days'),
(1, 7000.00, CURRENT_TIMESTAMP - INTERVAL '4 days'),
(1, 6900.00, CURRENT_TIMESTAMP - INTERVAL '3 days'),
(1, 7100.00, CURRENT_TIMESTAMP - INTERVAL '2 days'),
(1, 7200.00, CURRENT_TIMESTAMP - INTERVAL '1 days'),
(1, 7300.00, CURRENT_TIMESTAMP);

-- Reset SERIAL sequence generator for primary keys
SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));
