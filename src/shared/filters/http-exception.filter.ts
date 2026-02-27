import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ValidationError } from 'class-validator';

interface ErrorResponse {
  statusCode: number;
  timestamp: string;
  path: string;
  method: string;
  message: string | string[];
  error: string;
  requestId?: string;
  details?: any;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, error, details } = this.getErrorDetails(
      exception,
      request,
    );

    // Generate request ID for tracking
    const requestId = this.generateRequestId();

    // Log error with appropriate level based on status
    this.logError(exception, request, status, requestId);

    // Prepare standardized error response
    const errorResponse: ErrorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
      error,
      requestId,
    };

    // Only include details in development or for specific error types
    if (this.shouldIncludeDetails(status) && details) {
      errorResponse.details = details;
    }

    // Set security headers
    this.setSecurityHeaders(response);

    response.status(status).json(errorResponse);
  }

  private getErrorDetails(
    exception: unknown,
    request: Request,
  ): {
    status: number;
    message: string | string[];
    error: string;
    details?: any;
  } {
    // Handle HTTP exceptions
    if (exception instanceof HttpException) {
      return this.handleHttpException(exception);
    }

    // Handle validation errors
    if (this.isValidationError(exception)) {
      return this.handleValidationError(exception as ValidationError[]);
    }

    // Handle JWT errors
    if (this.isJWTError(exception)) {
      return this.handleJWTError(exception as Error);
    }

    // Handle known error types
    if (exception instanceof Error) {
      return this.handleKnownError(exception);
    }

    // Handle unknown errors
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred',
      error: 'Internal Server Error',
    };
  }

  private handleHttpException(exception: HttpException): {
    status: number;
    message: string | string[];
    error: string;
    details?: any;
  } {
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    let message: string | string[];
    let details: any;

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null
    ) {
      const responseObj = exceptionResponse as any;
      message = responseObj.message || responseObj.error || exception.message;
      details = responseObj.details || responseObj.constraints;
    } else {
      message = exception.message;
    }

    return {
      status,
      message,
      error: this.getErrorName(status),
      details,
    };
  }

  private handlePrismaError(exception: any): {
    status: number;
    message: string;
    error: string;
    details?: any;
  } {
    const code = exception.code;
    const meta = exception.meta;

    switch (code) {
      case 'P2000':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'The provided value is too long for the field',
          error: 'Bad Request',
          details: { field: meta?.column_name },
        };
      case 'P2001':
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Record not found',
          error: 'Not Found',
        };
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          message: `A record with this ${meta?.target?.join(', ') || 'value'} already exists`,
          error: 'Conflict',
          details: { fields: meta?.target },
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Foreign key constraint failed',
          error: 'Bad Request',
          details: { field: meta?.field_name },
        };
      case 'P2004':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'A constraint failed on the database',
          error: 'Bad Request',
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Record not found or already deleted',
          error: 'Not Found',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Database operation failed',
          error: 'Internal Server Error',
        };
    }
  }

  private handleValidationError(errors: ValidationError[]): {
    status: number;
    message: string[];
    error: string;
    details?: any;
  } {
    const messages = errors
      .map((error) => {
        const constraints = error.constraints;
        return constraints ? Object.values(constraints) : ['Validation failed'];
      })
      .flat();

    return {
      status: HttpStatus.BAD_REQUEST,
      message: messages,
      error: 'Bad Request',
      details: { validationErrors: errors },
    };
  }

  private handleJWTError(exception: Error): {
    status: number;
    message: string;
    error: string;
  } {
    const message = exception.message;

    if (message.includes('expired')) {
      return {
        status: HttpStatus.UNAUTHORIZED,
        message: 'Token has expired',
        error: 'Unauthorized',
      };
    }

    if (message.includes('invalid')) {
      return {
        status: HttpStatus.UNAUTHORIZED,
        message: 'Invalid token',
        error: 'Unauthorized',
      };
    }

    return {
      status: HttpStatus.UNAUTHORIZED,
      message: 'Authentication failed',
      error: 'Unauthorized',
    };
  }

  private handleKnownError(exception: Error): {
    status: number;
    message: string;
    error: string;
  } {
    const message = exception.message.toLowerCase();

    // Rate limiting errors
    if (
      message.includes('rate limit') ||
      message.includes('too many requests')
    ) {
      return {
        status: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many requests, please try again later',
        error: 'Too Many Requests',
      };
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('etimedout')) {
      return {
        status: HttpStatus.REQUEST_TIMEOUT,
        message: 'Request timeout',
        error: 'Request Timeout',
      };
    }

    // Network errors
    if (
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('enotfound')
    ) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Service temporarily unavailable',
        error: 'Service Unavailable',
      };
    }

    // File/upload errors
    if (
      message.includes('file') &&
      (message.includes('not found') || message.includes('missing'))
    ) {
      return {
        status: HttpStatus.NOT_FOUND,
        message: 'File not found',
        error: 'Not Found',
      };
    }

    if (message.includes('file') && message.includes('too large')) {
      return {
        status: HttpStatus.PAYLOAD_TOO_LARGE,
        message: 'File size exceeds limit',
        error: 'Payload Too Large',
      };
    }

    // Permission/access errors
    if (
      message.includes('permission') ||
      message.includes('access denied') ||
      message.includes('forbidden')
    ) {
      return {
        status: HttpStatus.FORBIDDEN,
        message: 'Access denied',
        error: 'Forbidden',
      };
    }

    // Default to internal server error
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred',
      error: 'Internal Server Error',
    };
  }

  private isValidationError(exception: unknown): boolean {
    return (
      Array.isArray(exception) &&
      exception.every((e) => e instanceof ValidationError)
    );
  }

  private isJWTError(exception: unknown): boolean {
    if (!(exception instanceof Error)) return false;
    const message = exception.message.toLowerCase();
    return (
      message.includes('jwt') ||
      message.includes('token') ||
      message.includes('signature') ||
      exception.name === 'JsonWebTokenError' ||
      exception.name === 'TokenExpiredError' ||
      exception.name === 'NotBeforeError'
    );
  }

  private getErrorName(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'Bad Request';
      case HttpStatus.UNAUTHORIZED:
        return 'Unauthorized';
      case HttpStatus.FORBIDDEN:
        return 'Forbidden';
      case HttpStatus.NOT_FOUND:
        return 'Not Found';
      case HttpStatus.CONFLICT:
        return 'Conflict';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'Unprocessable Entity';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'Too Many Requests';
      case HttpStatus.INTERNAL_SERVER_ERROR:
        return 'Internal Server Error';
      case HttpStatus.SERVICE_UNAVAILABLE:
        return 'Service Unavailable';
      case HttpStatus.REQUEST_TIMEOUT:
        return 'Request Timeout';
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return 'Payload Too Large';
      default:
        return 'Error';
    }
  }

  private logError(
    exception: unknown,
    request: Request,
    status: number,
    requestId: string,
  ): void {
    const logMessage = `[${request.method}] ${request.url} - Status: ${status} - RequestId: ${requestId}`;
    const errorDetails =
      exception instanceof Error ? exception.stack : String(exception);

    // Log different levels based on error severity
    if (status >= 500) {
      this.logger.error(`${logMessage} - ${errorDetails}`);
    } else if (status >= 400) {
      this.logger.warn(
        `${logMessage} - ${exception instanceof Error ? exception.message : String(exception)}`,
      );
    } else {
      this.logger.log(logMessage);
    }

    // Additional context logging for critical errors
    if (status >= 500) {
      this.logger.error(
        `Request context: User: ${request.user || 'anonymous'}, IP: ${this.getClientIP(request)}, UserAgent: ${request.get('user-agent') || 'unknown'}`,
      );
    }
  }

  private shouldIncludeDetails(status: number): boolean {
    const isDevelopment = process.env.NODE_ENV === 'development';
    const isTestEnvironment = process.env.NODE_ENV === 'test';

    // Always include details in development/test
    if (isDevelopment || isTestEnvironment) {
      return true;
    }

    // In production, only include details for client errors (4xx), not server errors (5xx)
    return status >= 400 && status < 500;
  }

  private setSecurityHeaders(response: Response): void {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('X-XSS-Protection', '1; mode=block');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate',
    );
    response.setHeader('Pragma', 'no-cache');
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getClientIP(request: Request): string {
    return (
      (request.headers['x-forwarded-for'] as string) ||
      (request.headers['x-real-ip'] as string) ||
      request.connection.remoteAddress ||
      request.socket.remoteAddress ||
      'unknown'
    )
      .split(',')[0]
      .trim();
  }
}
