import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorBody = { code: 'INTERNAL_ERROR', message: 'Internal server error' };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        body = { code: defaultCodeFor(status), message: res };
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, unknown>;
        body = {
          code: (r.code as string) ?? defaultCodeFor(status),
          message:
            (r.message as string) ??
            (Array.isArray(r.message) ? (r.message as string[]).join(', ') : 'Error'),
          details: r.details,
        };
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        body = {
          code: 'RESOURCE_ALREADY_EXISTS',
          message: 'Resource already exists',
          details: { target: exception.meta?.target },
        };
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        body = { code: 'RESOURCE_NOT_FOUND', message: 'Resource not found' };
      } else {
        this.logger.error(exception);
      }
    } else {
      this.logger.error(exception);
    }

    response.status(status).json({
      error: body,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}

function defaultCodeFor(status: number): string {
  switch (status) {
    case 400:
      return 'VALIDATION_ERROR';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'RESOURCE_NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 422:
      return 'UNPROCESSABLE';
    case 429:
      return 'RATE_LIMIT_EXCEEDED';
    default:
      return 'INTERNAL_ERROR';
  }
}
