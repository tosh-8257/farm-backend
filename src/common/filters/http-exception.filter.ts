import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { isTerminalSessionFailure } from '../session-error';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    let message: string | string[] = 'Internal server error';
    let errors: any = null;
    let code: string | undefined;
    let explicitInvalid: boolean | undefined;

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null
    ) {
      const r = exceptionResponse as any;
      message = r.message || 'Error';
      errors = Array.isArray(r.message) ? r.message : undefined;
      if (errors) message = 'Validation failed';
      if (typeof r.code === 'string') code = r.code;
      if (typeof r.session_invalid === 'boolean')
        explicitInvalid = r.session_invalid;
    }

    const text = Array.isArray(message) ? message.join(' ') : String(message);
    // A 403, a failed upload, or any non-401 must not look like a dead session.
    // The app treats session_invalid and the terminal codes as "sign out".
    let sessionInvalid = false;
    if (status === 401) {
      sessionInvalid = explicitInvalid ?? isTerminalSessionFailure(code, text);
    }
    if (status !== 401) {
      sessionInvalid = false;
      if (code && isTerminalSessionFailure(code, '')) {
        code = status === 403 ? 'forbidden' : 'request_failed';
      }
      if (status === 403 && isTerminalSessionFailure(undefined, text)) {
        message = 'You do not have permission to do that.';
        code = 'forbidden';
      }
    }
    if (!code) {
      if (status === 403) code = 'forbidden';
      else if (status === 400) code = 'bad_request';
      else if (status === 401)
        code = sessionInvalid ? 'session_revoked' : 'unauthorized';
      else if (status === 404) code = 'not_found';
      else if (status === 413) code = 'upload_rejected';
      else if (status >= 500) code = 'server_error';
      else code = 'request_failed';
    }

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json({
      success: false,
      statusCode: status,
      code,
      session_invalid: sessionInvalid,
      message,
      errors: errors ?? null,
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
