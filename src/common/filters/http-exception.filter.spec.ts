import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

function run(exception: unknown) {
  const json = jest.fn();
  const res = { status: jest.fn().mockReturnValue({ json }) };
  const host = {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => ({ method: 'POST', url: '/api/v1/uploads/single' }),
    }),
  };
  new HttpExceptionFilter().catch(exception, host as any);
  return { status: res.status.mock.calls[0][0], body: json.mock.calls[0][0] };
}

describe('HTTP errors are not session-invalidating', () => {
  it('marks a 403 as forbidden and keeps the session', () => {
    const out = run(new ForbiddenException('Insufficient permissions'));
    expect(out.status).toBe(403);
    expect(out.body.code).toBe('forbidden');
    expect(out.body.session_invalid).toBe(false);
  });

  it('does not treat an upload failure as a revoked session', () => {
    const out = run(new ForbiddenException('Token has been revoked'));
    expect(out.status).toBe(403);
    expect(out.body.session_invalid).toBe(false);
    expect(out.body.code).toBe('forbidden');
    expect(String(out.body.message).toLowerCase()).not.toContain('revoked');
  });

  it('marks a real revoked access token as session invalid', () => {
    const out = run(
      new UnauthorizedException({
        code: 'session_revoked',
        message: 'This session was revoked. Sign in again.',
        session_invalid: true,
      }),
    );
    expect(out.status).toBe(401);
    expect(out.body.session_invalid).toBe(true);
    expect(out.body.code).toBe('session_revoked');
  });

  it('keeps an expired access token refreshable', () => {
    const out = run(
      new UnauthorizedException({
        code: 'access_expired',
        message: 'Access token expired. Refresh and retry.',
        session_invalid: false,
      }),
    );
    expect(out.body.session_invalid).toBe(false);
    expect(out.body.code).toBe('access_expired');
  });
});
