import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/**
 * Guard for internal service-to-service calls (e.g., Python backend → NestJS).
 *
 * Supports TWO auth modes:
 * 1. JWT-authenticated user (req.user already set by AuthMiddleware) → passes through
 * 2. Internal service call with `X-Internal-Key` header + `X-User-Id` header
 *    → validates the key, then sets req.user from X-User-Id
 *
 * Usage: Apply on routes that can be called by both JWT users and internal services.
 */
@Injectable()
export class InternalApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(InternalApiKeyGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();

    // Mode 1: Already authenticated via JWT middleware
    if (req.user && typeof req.user === 'string') {
      return true;
    }

    // Mode 2: Internal service-to-service call (Python backend)
    const apiKey = (req.headers['x-internal-key'] as string) || undefined;
    const userId = (req.headers['x-user-id'] as string) || undefined;
    const expectedKey = this.configService.get<string>('INTERNAL_API_KEY');

    if (!expectedKey) {
      this.logger.error('INTERNAL_API_KEY not configured in environment');
      throw new UnauthorizedException('Server configuration error');
    }

    if (!apiKey) {
      this.logger.warn('No JWT user and no X-Internal-Key header');
      throw new UnauthorizedException('Authentication required. Provide a Bearer token or X-Internal-Key header.');
    }

    if (apiKey !== expectedKey) {
      this.logger.warn('Invalid internal API key');
      throw new UnauthorizedException('Invalid API key');
    }

    if (!userId) {
      this.logger.warn('X-Internal-Key valid but X-User-Id header missing');
      throw new BadRequestException('X-User-Id header is required for internal service calls');
    }

    // Set user on request so the controller can use req.user as usual
    req.user = userId;
    this.logger.log(`Internal service authenticated for user: ${userId}`);

    return true;
  }
}
