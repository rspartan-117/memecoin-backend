import {
  Injectable,
  Logger,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, JWTVerifyResult } from 'jose';
import { NextFunction, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { PrismaService } from 'src/shared/services/prisma.service';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: string;
    }
  }
}

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AuthMiddleware.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    try {
      const authHeader = req.headers['authorization'];

      if (!authHeader) {
        this.logger.warn('Missing authorization header');
        throw new UnauthorizedException('Missing authorization header');
      }

      const tokenParts = authHeader.trim().split(' ');
      if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
        this.logger.warn('Invalid authorization header format');
        throw new UnauthorizedException('Invalid authorization header format');
      }

      const token = tokenParts[1];

      let userId: string | undefined;

      // Check for test token (for development/testing only)
      if (token === 'test-token') {
        userId = 'test-user-12345';
        this.logger.debug('Using test token for test user');
      } else {
        // Get secret
        const secret = this.configService.get<string>('JWT_SECRET');
        if (!secret) {
          this.logger.error('JWT_SECRET not set in environment');
          throw new UnauthorizedException('Server configuration error');
        }

        let verified: JWTVerifyResult;

        try {
          verified = await jwtVerify(token, new TextEncoder().encode(secret), {
            maxTokenAge: '1d',
            algorithms: ['HS256'],
          });
          this.logger.debug('JWT successfully verified');
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`JWT verification failed: ${msg}`);
          throw new UnauthorizedException('Invalid or expired token');
        }

        // Log payload
        this.logger.debug(`Decoded payload: ${JSON.stringify(verified.payload)}`);

        // Fix: check for 'id' instead of 'userId'
        userId = verified.payload?.id as string | undefined;
      }
      if (!userId) {
        this.logger.warn('Missing "id" field in JWT payload');
        throw new UnauthorizedException('Invalid token payload');
      }

      // Lookup user
      const user = await this.prisma.users.findUnique({
        where: { id: userId as string },
        select: { id: true, status: true },
      });

      if (!user) {
        this.logger.warn(`User not found in DB: ${userId}`);
        throw new UnauthorizedException('User not found');
      }

      // Optional: status check
      // if (user.status !== 'ACTIVE') {
      //   this.logger.warn(`User inactive: ${user.id}`);
      //   throw new UnauthorizedException('User account is inactive');
      // }

      // Attach to request
      req.user = user.id;
      this.logger.log(`Authenticated user: ${user.id}`);

      // Secure headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate',
      );

      next();
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      const msg = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Unexpected error: ${msg}`, stack);
      throw new UnauthorizedException('Authentication failed');
    }
  }
}
