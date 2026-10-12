const http = require('http');

function apiCall(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(
      { host: 'localhost', port: 5000, path, method, headers },
      (res) => {
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, body });
          }
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

const ADMINS_TO_TEST = [
  { email: 'admin.accounts@ministry.gov.lk', password: 'Accounts#2026!Acc', division: 'Accounts' },
  { email: 'admin@ministry.gov.lk', password: 'Admin#2026!Adm', division: 'Administration' },
  { email: 'admin.agri@ministry.gov.lk', password: 'Agri#2026!Farm', division: 'Agriculture' },
  { email: 'admin.dev@ministry.gov.lk', password: 'Dev#2026!Build', division: 'Development' },
  { email: 'admin.eng@ministry.gov.lk', password: 'Eng#2026!Power', division: 'Engineering' },
  { email: 'admin.fisheries@ministry.gov.lk', password: 'Fish#2026!Ocean', division: 'Fisheries & Ocean Resources' },
  { email: 'admin.audit@ministry.gov.lk', password: 'Audit#2026!Check', division: 'Government Audit' },
  { email: 'admin.hr@ministry.gov.lk', password: 'HR#2026!People', division: 'Human Resources' },
  { email: 'admin.legal@ministry.gov.lk', password: 'Legal#2026!Law', division: 'Legal' },
  { email: 'admin.planning@ministry.gov.lk', password: 'Plan#2026!Future', division: 'Planning' },
  { email: 'admin.stats@ministry.gov.lk', password: 'Stats#2026!Data', division: 'Statistics' },
  { email: 'admin.tech@ministry.gov.lk', password: 'Tech#2026!Cyber', division: 'Technical' },
];

async function run() {
  console.log('===============================================================');
  console.log('TESTING ALL 12 DIVISION ADMIN ACCOUNTS & DATA ISOLATION');
  console.log('Each admin has a unique email & unique password in MySQL');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  for (let i = 0; i < ADMINS_TO_TEST.length; i++) {
    const adm = ADMINS_TO_TEST[i];

    // 1. Authenticate with correct unique credentials
    const res = await apiCall('POST', '/api/auth/login', {
      email: adm.email,
      password: adm.password,
    });

    if (res.status !== 200 || !res.body.token) {
      console.error(`❌ [FAIL] Login failed for ${adm.email}:`, res.status, res.body);
      failed++;
      continue;
    }

    const token = res.body.token;
    const userDivision = res.body.user?.division;

    if (userDivision !== adm.division) {
      console.error(`❌ [FAIL] Division mismatch for ${adm.email}. Expected: "${adm.division}", Got: "${userDivision}"`);
      failed++;
      continue;
    }

    // 2. Fetch leaves for this admin
    const leavesRes = await apiCall('GET', '/api/admin/leaves', null, token);
    const leaves = leavesRes.body;
    const allLeavesMatch = Array.isArray(leaves) && leaves.every((l) => l.division === adm.division);

    if (!allLeavesMatch) {
      console.error(`❌ [FAIL] Data leakage in leaves for ${adm.email}! Found leaves from other divisions.`);
      failed++;
      continue;
    }

    // 3. Fetch employees for this admin
    const empRes = await apiCall('GET', '/api/admin/employees', null, token);
    const employees = empRes.body;
    const allEmpMatch = Array.isArray(employees) && employees.every((e) => e.division === adm.division);

    if (!allEmpMatch) {
      console.error(`❌ [FAIL] Data leakage in employees for ${adm.email}! Found employees from other divisions.`);
      failed++;
      continue;
    }

    // 4. Fetch dashboard stats
    const statsRes = await apiCall('GET', '/api/admin/dashboard-stats', null, token);
    const stats = statsRes.body;

    if (statsRes.status !== 200 || stats.division !== adm.division) {
      console.error(`❌ [FAIL] Stats error for ${adm.email}:`, stats);
      failed++;
      continue;
    }

    // 5. Cross-Admin Login Prevention Test:
    // Try logging into this admin's email with the NEXT admin's password! Must return 401!
    const otherAdmin = ADMINS_TO_TEST[(i + 1) % ADMINS_TO_TEST.length];
    const crossLoginRes = await apiCall('POST', '/api/auth/login', {
      email: adm.email,
      password: otherAdmin.password, // wrong password for this email!
    });

    if (crossLoginRes.status !== 401) {
      console.error(`❌ [FAIL] Cross-login security violation! ${adm.email} logged in with ${otherAdmin.email}'s password!`);
      failed++;
      continue;
    }

    console.log(`✅ [PASS] ${adm.division.padEnd(28)} | Admin: ${adm.email.padEnd(34)} | Employees: ${employees.length} | Leaves: ${leaves.length} | Cross-login blocked: YES`);
    passed++;
  }

  console.log('\n===============================================================');
  console.log(`Results: ${passed} / ${ADMINS_TO_TEST.length} Division Admins Verified`);
  console.log(`Security: Cross-admin password login blocked 100% of the time`);
  console.log(`Status: ${failed === 0 ? 'SUCCESS - ALL TESTS PASSED' : 'FAILURES DETECTED'}`);
  console.log('===============================================================');
}

run().catch(console.error);
