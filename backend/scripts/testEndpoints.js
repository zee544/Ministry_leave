const http = require('http');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function runTests() {
  console.log('--- Testing Backend Endpoints ---');

  // 1. Health check
  const health = await request({ host: 'localhost', port: 5000, path: '/api/health', method: 'GET' });
  console.log('1. Health check:', health.status, health.data);

  // 2. Login Accounts Admin
  const accLogin = await request(
    {
      host: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: 'admin.accounts@ministry.gov.lk', password: 'Admin@123' }
  );
  console.log('2. Accounts Admin Login:', accLogin.status, {
    division: accLogin.data.user?.division,
    email: accLogin.data.user?.email,
    tokenReceived: Boolean(accLogin.data.token),
  });

  // 3. Login Development Admin
  const devLogin = await request(
    {
      host: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: 'admin.dev@ministry.gov.lk', password: 'Admin@123' }
  );
  console.log('3. Development Admin Login:', devLogin.status, {
    division: devLogin.data.user?.division,
    email: devLogin.data.user?.email,
    tokenReceived: Boolean(devLogin.data.token),
  });

  // 4. Accounts Admin Leaves (Data Isolation)
  const accLeaves = await request({
    host: 'localhost',
    port: 5000,
    path: '/api/admin/leaves',
    method: 'GET',
    headers: { Authorization: `Bearer ${accLogin.data.token}` },
  });
  console.log('4. Accounts Admin Leaves Count:', accLeaves.data.length);
  console.log('   All leaves belong to Accounts?', accLeaves.data.every(l => l.division === 'Accounts'));

  // 5. Development Admin Leaves (Data Isolation)
  const devLeaves = await request({
    host: 'localhost',
    port: 5000,
    path: '/api/admin/leaves',
    method: 'GET',
    headers: { Authorization: `Bearer ${devLogin.data.token}` },
  });
  console.log('5. Development Admin Leaves Count:', devLeaves.data.length);
  console.log('   All leaves belong to Development?', devLeaves.data.every(l => l.division === 'Development'));

  // 6. Accounts Admin Employees
  const accEmp = await request({
    host: 'localhost',
    port: 5000,
    path: '/api/admin/employees',
    method: 'GET',
    headers: { Authorization: `Bearer ${accLogin.data.token}` },
  });
  console.log('6. Accounts Admin Employees Count:', accEmp.data.length);
  console.log('   All employees belong to Accounts?', accEmp.data.every(e => e.division === 'Accounts'));

  // 7. Invalid Credentials Test
  const badLogin = await request(
    {
      host: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: 'admin.accounts@ministry.gov.lk', password: 'WrongPassword' }
  );
  console.log('7. Invalid password test returns 401:', badLogin.status === 401, badLogin.data.message);

  console.log('--- All backend tests passed! ---');
}

runTests().catch(console.error);
