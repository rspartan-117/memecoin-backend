import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import * as validator from 'validator';

export class SecurityUtils {
  /**
   * Sanitize input by removing potentially dangerous characters
   */
  static sanitizeInput(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    return input.trim();
  }

  /**
   * Validate and sanitize email address
   */
  static validateEmail(email: string): string {
    if (!email || typeof email !== 'string') {
      throw new BadRequestException('Email is required');
    }

    const sanitizedEmail = this.sanitizeInput(email.toLowerCase());

    if (!validator.isEmail(sanitizedEmail)) {
      throw new BadRequestException('Invalid email format');
    }

    if (sanitizedEmail.length > 254) {
      throw new BadRequestException('Email is too long');
    }

    return sanitizedEmail;
  }

  /**
   * Validate wallet address format (ETH/EVM)
   */
  static validateWalletAddress(address: string): string {
    if (!address || typeof address !== 'string') {
      throw new BadRequestException('Wallet address is required');
    }

    const sanitizedAddress = this.sanitizeInput(address);

    // Basic ETH address validation
    if (!/^0x[a-fA-F0-9]{40}$/.test(sanitizedAddress)) {
      throw new BadRequestException('Invalid wallet address format');
    }

    return sanitizedAddress.toLowerCase();
  }

  /**
   * Validate UUID format
   */
  static validateUUID(uuid: string): string {
    if (!uuid || typeof uuid !== 'string') {
      throw new BadRequestException('ID is required');
    }

    const sanitizedUuid = this.sanitizeInput(uuid);

    if (!validator.isUUID(sanitizedUuid)) {
      throw new BadRequestException('Invalid ID format');
    }

    return sanitizedUuid;
  }

  /**
   * Validate and sanitize string input with length limits
   */
  static validateString(
    input: string,
    fieldName: string,
    minLength: number = 1,
    maxLength: number = 255,
    required: boolean = true,
  ): string {
    if (!input && required) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    if (!input && !required) {
      return '';
    }

    if (typeof input !== 'string') {
      throw new BadRequestException(`${fieldName} must be a string`);
    }

    const sanitized = this.sanitizeInput(input);

    if (sanitized.length < minLength) {
      throw new BadRequestException(
        `${fieldName} must be at least ${minLength} characters long`,
      );
    }

    if (sanitized.length > maxLength) {
      throw new BadRequestException(
        `${fieldName} must not exceed ${maxLength} characters`,
      );
    }

    return sanitized;
  }

  /**
   * Validate URL format
   */
  static validateUrl(url: string, required: boolean = true): string {
    if (!url && !required) {
      return '';
    }

    if (!url && required) {
      throw new BadRequestException('URL is required');
    }

    const sanitizedUrl = this.sanitizeInput(url);

    if (
      !validator.isURL(sanitizedUrl, {
        protocols: ['http', 'https'],
        require_protocol: true,
        require_host: true,
        require_valid_protocol: true,
        allow_underscores: false,
        allow_trailing_dot: false,
        allow_protocol_relative_urls: false,
      })
    ) {
      throw new BadRequestException('Invalid URL format');
    }

    return sanitizedUrl;
  }

  /**
   * Validate numeric input
   */
  static validateNumber(
    input: any,
    fieldName: string,
    min?: number,
    max?: number,
    required: boolean = true,
  ): number {
    if (input === undefined || input === null) {
      if (required) {
        throw new BadRequestException(`${fieldName} is required`);
      }
      return 0;
    }

    const num = Number(input);

    if (isNaN(num) || !isFinite(num)) {
      throw new BadRequestException(`${fieldName} must be a valid number`);
    }

    if (min !== undefined && num < min) {
      throw new BadRequestException(`${fieldName} must be at least ${min}`);
    }

    if (max !== undefined && num > max) {
      throw new BadRequestException(`${fieldName} must not exceed ${max}`);
    }

    return num;
  }

  /**
   * Validate array input
   */
  static validateArray<T>(
    input: any,
    fieldName: string,
    minLength: number = 0,
    maxLength: number = 100,
    required: boolean = true,
  ): T[] {
    if (!input && !required) {
      return [];
    }

    if (!input && required) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    if (!Array.isArray(input)) {
      throw new BadRequestException(`${fieldName} must be an array`);
    }

    if (input.length < minLength) {
      throw new BadRequestException(
        `${fieldName} must contain at least ${minLength} items`,
      );
    }

    if (input.length > maxLength) {
      throw new BadRequestException(
        `${fieldName} must not contain more than ${maxLength} items`,
      );
    }

    return input;
  }

  /**
   * Generate secure random string
   */
  static generateSecureRandom(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Hash sensitive data
   */
  static hashSensitiveData(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Validate request rate limiting
   */
  static validateRateLimit(
    userRequests: Map<string, number[]>,
    userId: string,
    windowMs: number = 60000,
    maxRequests: number = 100,
  ): void {
    const now = Date.now();
    const userRequestTimes = userRequests.get(userId) || [];

    // Remove old requests outside the window
    const recentRequests = userRequestTimes.filter(
      (time) => now - time < windowMs,
    );

    if (recentRequests.length >= maxRequests) {
      throw new BadRequestException(
        'Rate limit exceeded. Please try again later.',
      );
    }

    recentRequests.push(now);
    userRequests.set(userId, recentRequests);
  }

  /**
   * Validate file upload security
   */
  static validateFileUpload(
    file: any,
    allowedMimeTypes: string[] = [],
    maxSizeBytes: number = 10 * 1024 * 1024, // 10MB
  ): void {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (file.size > maxSizeBytes) {
      throw new BadRequestException(
        `File size exceeds limit of ${maxSizeBytes / 1024 / 1024}MB`,
      );
    }

    if (
      allowedMimeTypes.length > 0 &&
      !allowedMimeTypes.includes(file.mimetype)
    ) {
      throw new BadRequestException(
        `File type not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`,
      );
    }

    // Check for potential security issues in filename
    const filename = file.originalname || file.filename || '';
    if (
      filename.includes('..') ||
      filename.includes('/') ||
      filename.includes('\\')
    ) {
      throw new BadRequestException('Invalid filename');
    }
  }

  /**
   * Sanitize object properties recursively
   */
  static sanitizeObject(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.sanitizeInput(obj);
    }

    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item));
    }

    if (typeof obj === 'object') {
      try {
        const sanitized: any = {};

        // Handle objects that might not have standard prototype
        const keys = Object.keys(obj);
        for (const key of keys) {
          try {
            // Use Object.prototype.hasOwnProperty.call() for safety
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
              sanitized[key] = this.sanitizeObject(obj[key]);
            }
          } catch (keyError) {
            // Skip problematic keys
            continue;
          }
        }
        return sanitized;
      } catch (error) {
        // If object processing fails, return the original object
        return obj;
      }
    }

    return obj;
  }

  /**
   * Validate pagination parameters
   */
  static validatePagination(
    page?: number,
    limit?: number,
  ): { page: number; limit: number } {
    const validatedPage = Math.max(
      1,
      this.validateNumber(page || 1, 'page', 1, 1000, false),
    );
    const validatedLimit = Math.min(
      100,
      Math.max(1, this.validateNumber(limit || 20, 'limit', 1, 100, false)),
    );

    return { page: validatedPage, limit: validatedLimit };
  }

  /**
   * Validate session ID format
   */
  static validateSessionId(sessionId: string): string {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new BadRequestException('Session ID is required');
    }

    const sanitized = this.sanitizeInput(sessionId);

    // Allow alphanumeric, hyphens, and underscores
    if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
      throw new BadRequestException('Invalid session ID format');
    }

    if (sanitized.length < 3 || sanitized.length > 100) {
      throw new BadRequestException(
        'Session ID must be between 3 and 100 characters',
      );
    }

    return sanitized;
  }

  /**
   * Remove sensitive information from logs
   */
  static sanitizeForLogging(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeForLogging(item));
    }

    if (typeof obj === 'object') {
      const sanitized: any = {};
      const sensitiveFields = [
        'password',
        'token',
        'secret',
        'key',
        'auth',
        'credential',
        'signMessage',
        'signature',
        'privateKey',
        'mnemonic',
      ];

      for (const key in obj) {
        // Use Object.prototype.hasOwnProperty.call() instead of obj.hasOwnProperty()
        // This prevents errors when obj doesn't have hasOwnProperty method
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const lowerKey = key.toLowerCase();
          if (sensitiveFields.some((field) => lowerKey.includes(field))) {
            sanitized[key] = '[REDACTED]';
          } else {
            sanitized[key] = this.sanitizeForLogging(obj[key]);
          }
        }
      }
      return sanitized;
    }

    return obj;
  }
}
