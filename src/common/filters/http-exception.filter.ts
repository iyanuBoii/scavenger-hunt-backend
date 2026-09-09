import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponseBody {
  statusCode: number;
  errorCode: string;
  message: string;
  path: string;
  timestamp: string;
}

/**
 * Catches every unhandled exception - both NestJS HttpExceptions and raw
 * errors thrown from providers/repositories - and normalizes them into one
 * consistent response shape, instead of varying by module.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, errorCode, message } = this.normalize(exception);

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${statusCode} ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const body: ErrorResponseBody = {
      statusCode,
      errorCode,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(statusCode).json(body);
  }

  private normalize(exception: unknown): {
    statusCode: number;
    errorCode: string;
    message: string;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ?? exception.message);

      return {
        statusCode: status,
        errorCode: HttpStatus[status] ?? 'HTTP_EXCEPTION',
        message: Array.isArray(message) ? message.join(', ') : message,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred.',
    };
  }
}
