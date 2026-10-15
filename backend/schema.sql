-- =====================================================================
-- Ministry Leave Management System - MySQL Database Schema
-- Database: employes_db
-- =====================================================================

CREATE DATABASE IF NOT EXISTS `employes_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `employes_db`;

-- ---------------------------------------------------------------------
-- 1. Divisions Table (12 Divisions)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `divisions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL UNIQUE,
  `code` VARCHAR(20) NOT NULL UNIQUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `divisions` (`name`, `code`) VALUES
('Accounts', 'ACC'),
('Administration', 'ADMIN'),
('Agriculture', 'AGRI'),
('Development', 'DEV'),
('Engineering', 'ENG'),
('Fisheries & Ocean Resources', 'FISH'),
('Government Audit', 'AUDIT'),
('Human Resources', 'HR'),
('Legal', 'LEGAL'),
('Planning', 'PLAN'),
('Statistics', 'STATS'),
('Technical', 'TECH')
ON DUPLICATE KEY UPDATE `code` = VALUES(`code`);

-- ---------------------------------------------------------------------
-- 2. Admins Table (12 Division Admins, 1 per division)
-- Each admin has their own unique email and unique password.
-- Passwords are stored separately in MySQL as secure bcrypt hashes.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `admins` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(150) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `division` VARCHAR(100) NOT NULL,
  `role` VARCHAR(50) DEFAULT 'admin',
  `designation` VARCHAR(100) DEFAULT 'System Administrator',
  `employee_id` VARCHAR(50),
  `signature_image` MEDIUMTEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_admin_division` (`division`),
  INDEX `idx_admin_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Note: Run `npm run setup-db -- --seed` to generate and seed unique bcrypt
-- hashes for the 12 demo admins, or configure admin accounts directly:
-- 1.  Accounts:                     admin.accounts@ministry.gov.lk  / Accounts#2026!Acc
-- 2.  Administration:               admin@ministry.gov.lk           / Admin#2026!Adm
-- 3.  Agriculture:                  admin.agri@ministry.gov.lk      / Agri#2026!Farm
-- 4.  Development:                  admin.dev@ministry.gov.lk       / Dev#2026!Build
-- 5.  Engineering:                  admin.eng@ministry.gov.lk       / Eng#2026!Power
-- 6.  Fisheries & Ocean Resources:  admin.fisheries@ministry.gov.lk / Fish#2026!Ocean
-- 7.  Government Audit:             admin.audit@ministry.gov.lk     / Audit#2026!Check
-- 8.  Human Resources:              admin.hr@ministry.gov.lk        / HR#2026!People
-- 9.  Legal:                        admin.legal@ministry.gov.lk     / Legal#2026!Law
-- 10. Planning:                     admin.planning@ministry.gov.lk  / Plan#2026!Future
-- 11. Statistics:                   admin.stats@ministry.gov.lk     / Stats#2026!Data
-- 12. Technical:                    admin.tech@ministry.gov.lk      / Tech#2026!Cyber

-- ---------------------------------------------------------------------
-- 3. Heads of Division
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `hod` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(150) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `division` VARCHAR(100) NOT NULL,
  `role` VARCHAR(50) DEFAULT 'hod',
  `designation` VARCHAR(100) DEFAULT 'Head of Division',
  `employee_id` VARCHAR(50),
  `signature_image` MEDIUMTEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_hod_division` (`division`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 4. Employees Table (Scoped by Division)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `employees` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(150) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL DEFAULT '',
  `must_change_password` BOOLEAN NOT NULL DEFAULT FALSE,
  `designation` VARCHAR(100) NOT NULL,
  `division` VARCHAR(100) NOT NULL,
  `appointment_date` DATE NOT NULL,
  `status` ENUM('Active', 'Inactive', 'On Leave') DEFAULT 'Active',
  `signature_image` MEDIUMTEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_emp_division` (`division`),
  INDEX `idx_emp_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 5. Leaves Table (Scoped by Division)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `leaves` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `employee` VARCHAR(100) NOT NULL,
  `division` VARCHAR(100) NOT NULL,
  `type` VARCHAR(50) NOT NULL,
  `from_date` DATE NOT NULL,
  `to_date` DATE NOT NULL,
  `no_of_days` DECIMAL(4, 1) NOT NULL,
  `acting_officer` VARCHAR(100),
  `applicant_user_id` INT DEFAULT NULL,
  `applicant_role` VARCHAR(20) DEFAULT NULL,
  `status` VARCHAR(50) DEFAULT 'Pending',
  `applied_by` VARCHAR(100) NOT NULL,
  `applied_on` DATE NOT NULL,
  `reason` TEXT,
  `address` TEXT,
  `recommended_by_admin` BOOLEAN DEFAULT FALSE,
  `declined_by` VARCHAR(50) DEFAULT NULL,
  `decline_reason` TEXT,
  `acting_officer_confirmed` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_leave_division` (`division`),
  INDEX `idx_leave_status` (`status`),
  INDEX `idx_leave_applied_on` (`applied_on`),
  INDEX `idx_leave_applicant` (`applicant_user_id`, `applicant_role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 6. Persistent Notifications
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `message` TEXT NOT NULL,
  `type` VARCHAR(50) NOT NULL,
  `recipient` VARCHAR(100) NOT NULL,
  `division` VARCHAR(100),
  `link` VARCHAR(255),
  `read_status` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_notification_recipient_created` (`recipient`, `created_at`),
  INDEX `idx_notification_division_created` (`division`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 7. Password Reset Tokens
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `password_resets` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(150) NOT NULL,
  `role` VARCHAR(20) NOT NULL,
  `token_hash` CHAR(64) NOT NULL UNIQUE,
  `expires_at` DATETIME NOT NULL,
  `used` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_password_resets_email_role_used` (`email`, `role`, `used`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
