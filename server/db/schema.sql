-- FinPilot MySQL Schema

CREATE DATABASE IF NOT EXISTS finpilot;
USE finpilot;

-- Sales invoices
CREATE TABLE IF NOT EXISTS sales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_id VARCHAR(50) UNIQUE NOT NULL,
    customer_id VARCHAR(50) NOT NULL,
    customer_name VARCHAR(150),
    amount DECIMAL(12,2) NOT NULL,
    invoice_date DATE NOT NULL,
    due_date DATE,
    status ENUM('open','paid','partial','overdue') DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Purchase invoices (vendor side)
CREATE TABLE IF NOT EXISTS purchases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_id VARCHAR(50) UNIQUE NOT NULL,
    vendor_id VARCHAR(50) NOT NULL,
    vendor_name VARCHAR(150),
    amount DECIMAL(12,2) NOT NULL,
    purchase_date DATE NOT NULL,
    due_date DATE,
    status ENUM('open','paid','partial','overdue') DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payments (can reference either a sales invoice or a purchase)
CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payment_id VARCHAR(50) UNIQUE NOT NULL,
    reference_id VARCHAR(50),        -- expected invoice_id / purchase_id (may be missing/wrong)
    party_id VARCHAR(50),            -- customer_id or vendor_id
    amount DECIMAL(12,2) NOT NULL,
    payment_date DATE NOT NULL,
    payment_type ENUM('receivable','payable') NOT NULL,
    raw_note VARCHAR(255),           -- free-text note from bank/gateway, often messy
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Credit notes (used by the agent to explain shortfalls)
CREATE TABLE IF NOT EXISTS credit_notes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    credit_note_id VARCHAR(50) UNIQUE NOT NULL,
    invoice_id VARCHAR(50),
    amount DECIMAL(12,2) NOT NULL,
    reason VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Reconciliation results / audit trail (the core output table)
CREATE TABLE IF NOT EXISTS exceptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    record_type ENUM('sales','purchase') NOT NULL,
    record_id VARCHAR(50) NOT NULL,       -- invoice_id or purchase_id
    payment_id VARCHAR(50),               -- matched payment, if any
    status ENUM('matched','partial_payment','pending','overdue','exception') NOT NULL,
    resolved_by_tier ENUM('rule','groq','claude') NOT NULL,
    confidence DECIMAL(5,2),              -- 0.00 - 100.00, null for pure rule matches
    evidence JSON,                        -- list of checks performed + findings
    recommended_action VARCHAR(500),
    escalated_at TIMESTAMP NULL,
    escalated_to VARCHAR(150) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_exceptions_status ON exceptions(status);
CREATE INDEX idx_exceptions_tier ON exceptions(resolved_by_tier);
