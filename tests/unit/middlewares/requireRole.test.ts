import { requireRole } from '../../../src/middlewares/requireRole';

function mockReqRes(role: string) {
  const req: any = { authUser: { role } };
  const res: any = {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: any) {
      this.body = body;
      return this;
    },
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('requireRole', () => {
  it('calls next() when the role is allowed', () => {
    const { req, res, next } = mockReqRes('admin');
    requireRole('admin', 'user')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when the role is not allowed', () => {
    const { req, res, next } = mockReqRes('final_user');
    requireRole('admin', 'user')(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});
