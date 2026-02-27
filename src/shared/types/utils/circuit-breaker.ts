import { Injectable, Logger } from '@nestjs/common';

/**
 * Circuit Breaker pattern implementation to prevent cascading failures when external services fail
 */
@Injectable()
export class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private readonly logger = new Logger(CircuitBreaker.name);

  // Circuit breaker configuration
  private readonly failureThreshold = 5;
  private readonly resetTimeout = 30000; // 30 seconds
  private readonly halfOpenSuccessThreshold = 3;

  /**
   * Execute a function with circuit breaker protection
   * @param fn - Function to execute
   * @param serviceName - Name of the service being called (for logging)
   * @returns The result of the function
   * @throws Error if the circuit is open
   */
  async executeWithCircuitBreaker<T>(
    fn: () => Promise<T>,
    serviceName: string,
  ): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.logger.log(`Circuit for ${serviceName} moving to HALF_OPEN state`);
        this.state = 'HALF_OPEN';
      } else {
        this.logger.warn(
          `Circuit for ${serviceName} is OPEN, rejecting request`,
        );
        throw new Error(`Circuit breaker is OPEN for ${serviceName}`);
      }
    }

    try {
      const result = await fn();

      if (this.state === 'HALF_OPEN') {
        this.successCount++;
        if (this.successCount >= this.halfOpenSuccessThreshold) {
          this.logger.log(
            `Circuit for ${serviceName} is restored to CLOSED state`,
          );
          this.reset();
        }
      }

      return result;
    } catch (error) {
      this.handleFailure(serviceName, error);
      throw error;
    }
  }

  private handleFailure(serviceName: string, error: any): void {
    this.lastFailureTime = Date.now();
    this.failureCount++;

    this.logger.error(
      `Service call to ${serviceName} failed (${this.failureCount}/${this.failureThreshold})`,
      error.stack,
    );

    if (this.state === 'CLOSED' && this.failureCount >= this.failureThreshold) {
      this.logger.warn(`Circuit for ${serviceName} is now OPEN`);
      this.state = 'OPEN';
    } else if (this.state === 'HALF_OPEN') {
      this.logger.warn(
        `Circuit for ${serviceName} returned to OPEN after failed test`,
      );
      this.state = 'OPEN';
    }
  }

  private reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
  }
}
