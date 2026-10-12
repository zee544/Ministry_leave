# Ministry Leave Management System (MERN + MySQL)

Leave Management System built with React, Vite, Tailwind CSS, Express (Node.js), and MySQL.

## Overview
The system supports **12 Ministry Divisions**. Each division has a designated Division Admin. All 12 admins share the same Admin Dashboard interface, but when an admin logs in, the backend identifies their division via JWT and scopes all data (employees, leave applications, metrics) strictly to their division.

---

## 12 Division Admin Accounts (Stored in MySQL)

All admin credentials are stored securely in MySQL (`employes_db.admins`) with bcrypt password hashing.

| # | Division | Admin Name | Email | Unique Password |
|---|----------|------------|-------|-----------------|
| 1 | Accounts | Accounts Admin | `admin.accounts@ministry.gov.lk` | `Accounts#2026!Acc` |
| 2 | Administration | Samuel Kiprop | `admin@ministry.gov.lk` | `Admin#2026!Adm` |
| 3 | Agriculture | Agriculture Admin | `admin.agri@ministry.gov.lk` | `Agri#2026!Farm` |
| 4 | Development | Development Admin | `admin.dev@ministry.gov.lk` | `Dev#2026!Build` |
| 5 | Engineering | Engineering Admin | `admin.eng@ministry.gov.lk` | `Eng#2026!Power` |
| 6 | Fisheries & Ocean Resources | Fisheries Admin | `admin.fisheries@ministry.gov.lk` | `Fish#2026!Ocean` |
| 7 | Government Audit | Audit Admin | `admin.audit@ministry.gov.lk` | `Audit#2026!Check` |
| 8 | Human Resources | HR Admin | `admin.hr@ministry.gov.lk` | `HR#2026!People` |
| 9 | Legal | Legal Admin | `admin.legal@ministry.gov.lk` | `Legal#2026!Law` |
| 10 | Planning | Planning Admin | `admin.planning@ministry.gov.lk` | `Plan#2026!Future` |
| 11 | Statistics | Statistics Admin | `admin.stats@ministry.gov.lk` | `Stats#2026!Data` |
| 12 | Technical | Technical Admin | `admin.tech@ministry.gov.lk` | `Tech#2026!Cyber` |

*(Admin accounts, passwords, and assignments can be configured directly in MySQL database.)*

### Demo Non-Admin Accounts
- **HOD**: `hod@ministry.gov.lk` / `Hod@1234`
- **Employee**: `nancy.moraa@ministry.gov.lk` / `Nancy@123`

---

## Configuration (`backend/.env`)

```env
PORT=5000

# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=employes_db

# JWT Configuration
JWT_SECRET=leave_sys_123
JWT_EXPIRE=1d
```

---

## Running the Application

### 1. Database Setup (MySQL)
Make sure your MySQL server (e.g. via XAMPP) is running.
To initialize or safely add the tables and columns required by the current backend without inserting demo users or leave records:
```bash
cd backend
npm run setup-db
```
For a new demo installation, explicitly seed the sample accounts and leave records with `npm run setup-db -- --seed`. Seeding only inserts records whose unique email does not already exist.
For a fresh database, you can also import `backend/schema.sql` directly into phpMyAdmin or MySQL CLI. The setup script is recommended for existing installations because it adds missing columns without removing existing records.

### 2. Start Backend Server
```bash
cd backend
npm install
npm start
```
Runs at: `http://localhost:5000`

### 3. Start Frontend Development Server
```bash
cd Frontend
npm install
npm run dev
```
Runs at: `http://localhost:5173` (requests to `/api` are automatically proxied to port 5000).

---

## Data Isolation Architecture
1. **Authentication**: `POST /api/auth/login` checks credentials in the MySQL `admins` table and generates a signed JWT embedding the admin's `division` and `role`.
2. **Scoping**: Backend middleware extracts the division from the verified JWT.
3. **Database Queries**: All data endpoints (`/api/admin/leaves`, `/api/admin/employees`, `/api/admin/dashboard-stats`) query MySQL using `WHERE division = ?`.
4. **UI**: Division admins all use the unified Admin Dashboard with zero changes to the UI layout.
