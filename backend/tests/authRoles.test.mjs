import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  requireAdmin,
  requireHOD,
  requireAdminOrHOD,
  requireEmployee,
} = require('../middleware/auth');

function runMiddleware(middleware, role) {
  const req = role ? { user: { role } } : {};
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const next = vi.fn();

  middleware(req, res, next);

  return { res, next };
}

describe('role authorization middleware', () => {
  it.each([
    ['admin', requireAdmin],
    ['hod', requireHOD],
    ['employee', requireEmployee],
  ])('allows the %s role through its matching guard', (role, middleware) => {
    const { res, next } = runMiddleware(middleware, role);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each([
    ['admin', requireAdmin],
    ['hod', requireHOD],
    ['employee', requireEmployee],
  ])('denies a non-matching role for the %s guard', (role, middleware) => {
    const otherRole = role === 'admin' ? 'employee' : 'admin';
    const { res, next } = runMiddleware(middleware, otherRole);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it.each(['admin', 'hod'])('allows %s through the combined guard', (role) => {
    const { res, next } = runMiddleware(requireAdminOrHOD, role);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('denies a user without a role from the combined guard', () => {
    const { res, next } = runMiddleware(requireAdminOrHOD);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
