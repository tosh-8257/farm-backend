import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { isTerminalSessionFailure } from '../session-error';

/**
 * Passport turns an expired access token and a missing token into the same
 * 401. Distinguish them so the app refreshes an expired access token and
 * only signs out when the session itself is revoked.
 * Permission failures stay 403 with session_invalid false (see the HTTP filter).
 */
@Injectable()
export class JwtGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any) {
    if (user) return user;
    const body =
      typeof err?.getResponse === 'function' ? err.getResponse() : null;
    const bodyMessage =
      body && typeof body === 'object'
        ? body.message
        : typeof body === 'string'
          ? body
          : undefined;
    const code = body && typeof body === 'object' ? body.code : undefined;
    const text = String(
      bodyMessage || err?.message || info?.message || info?.name || '',
    );
    if (isTerminalSessionFailure(code, text)) {
      throw new UnauthorizedException({
        code: 'session_revoked',
        message: 'This session was revoked. Sign in again.',
        session_invalid: true,
      });
    }
    const expired =
      info?.name === 'TokenExpiredError' ||
      /jwt expired|token expired/i.test(text);
    if (expired) {
      throw new UnauthorizedException({
        code: 'access_expired',
        message: 'Access token expired. Refresh and retry.',
        session_invalid: false,
      });
    }
    throw new UnauthorizedException({
      code: 'unauthorized',
      message: 'Authentication is required',
      session_invalid: false,
    });
  }
}
