import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() === 'http') {
      return this.logHttpCall(context, next);
    }
    return next.handle();
  }

  private logHttpCall(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();
    const userAgent = request.get('user-agent') || '';
    const { ip, method, path: url } = request;
    const correlationKey = uuidv4();

    // req.user is set as a plain string (user ID) by AuthMiddleware,
    // not an object with a userId property.
    const userId =
      typeof request.user === 'string'
        ? request.user
        : request.user?.userId || request.user?.id;

    this.logger.log(
      `[${correlationKey}] ${method} ${url} ${userId || 'anonymous'} ${userAgent} ${ip}: ${
        context.getClass().name
      } ${context.getHandler().name}`,
    );

    const now = Date.now();

    // Use finalize() instead of tap() so the completion log fires exactly
    // ONCE when the Observable completes (or errors / unsubscribes).
    // tap() fires on every emission — for SSE streams that means hundreds
    // of duplicate log lines (one per Server-Sent Event).
    return next.handle().pipe(
      finalize(() => {
        const response = context.switchToHttp().getResponse();
        const { statusCode } = response;
        const contentLength = response.get('content-length');

        this.logger.log(
          `[${correlationKey}] ${method} ${url} ${statusCode} ${contentLength || '-'}: ${
            Date.now() - now
          }ms`,
        );
      }),
    );
  }
}
