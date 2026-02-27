import { ConfigService } from '@nestjs/config';

/**
 * Security configuration for the application
 * Centralizes security settings to make them more maintainable
 */
export class SecurityConfig {
  constructor(private configService: ConfigService) {}

  /**
   * Get helmet configuration options
   */
  getHelmetConfig() {
    const isProduction = this.configService.get('NODE_ENV') === 'production';

    return {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'https:'],
          fontSrc: ["'self'", 'https:', 'data:'],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: false,
      hsts: isProduction
        ? {
            maxAge: 31536000, // 1 year in seconds
            includeSubDomains: true,
            preload: true,
          }
        : false,
    };
  }

  /**
   * Get CORS configuration options
   */
  getCorsConfig() {
    const allowedOrigins = this.configService.get('CORS_ALLOWED_ORIGINS');

    return {
      origin: allowedOrigins?.split(',') || '*',
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      credentials: true,
      maxAge: 86400, // 24 hours in seconds
    };
  }

  /**
   * Get rate limiting configuration
   */
  getRateLimitConfig() {
    const isProduction = this.configService.get('NODE_ENV') === 'production';

    return [
      {
        ttl: 60000, // 1 minute in milliseconds
        limit: isProduction ? 30 : 100, // Stricter in production
      },
    ];
  }

  /**
   * Get JWT configuration
   */
  getJwtConfig() {
    return {
      secret: this.configService.getOrThrow('JWT_SECRET'),
      signOptions: {
        expiresIn: '1d',
        algorithm: 'HS256',
      },
      verifyOptions: {
        algorithms: ['HS256'],
        maxAge: '1d',
      },
    };
  }
}
