import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');
const { verifyToken } = require('../middleware/auth');

const originalJwtSecret = process.env.JWT_SECRET;

function createResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe('verifyToken middleware', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'vitest-auth-token-secret';
  });

  afterAll(() => {
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
  });

  it('rejects requests without an authorization header', () => {
    const req = { headers: {} };
    const res = createResponse();
    const next = vi.fn();

    verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Access denied. No authentication token provided.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts a valid Bearer token and attaches its claims to the request', () => {
    const claims = { id: 7, role: 'employee', division: 'Accounts' };
    const token = jwt.sign(claims, process.env.JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = createResponse();
    const next = vi.fn();

    verifyToken(req, res, next);

    expect(req.user).toMatchObject(claims);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects an invalid token', () => {
    const req = { headers: { authorization: 'Bearer invalid-token' } };
    const res = createResponse();
    const next = vi.fn();

    verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Invalid or expired token. Please log in again.',
    });
    expect(next).not.toHaveBeenCalled();
  });
});
