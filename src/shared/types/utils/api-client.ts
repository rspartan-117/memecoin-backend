import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig } from 'axios';
import { CircuitBreaker } from './circuit-breaker';

/**
 * API Client wrapper with circuit breaker pattern
 * Use this for all external API calls to prevent cascading failures
 */
@Injectable()
export class ApiClient {
  private readonly logger = new Logger(ApiClient.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly circuitBreaker: CircuitBreaker,
  ) {}

  /**
   * Make a GET request with circuit breaker protection
   * @param url - The URL to request
   * @param config - Axios request config
   * @returns The response data
   */
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const serviceName = this.getServiceName(url);

    return this.circuitBreaker.executeWithCircuitBreaker(async () => {
      this.logger.log(`Making GET request to ${url}`);
      const response = await firstValueFrom(
        this.httpService.get<T>(url, config),
      );
      return response.data;
    }, serviceName);
  }

  /**
   * Make a POST request with circuit breaker protection
   * @param url - The URL to request
   * @param data - The data to send
   * @param config - Axios request config
   * @returns The response data
   */
  async post<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const serviceName = this.getServiceName(url);

    return this.circuitBreaker.executeWithCircuitBreaker(async () => {
      this.logger.log(`Making POST request to ${url}`);
      const response = await firstValueFrom(
        this.httpService.post<T>(url, data, config),
      );
      return response.data;
    }, serviceName);
  }

  /**
   * Make a PUT request with circuit breaker protection
   * @param url - The URL to request
   * @param data - The data to send
   * @param config - Axios request config
   * @returns The response data
   */
  async put<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const serviceName = this.getServiceName(url);

    return this.circuitBreaker.executeWithCircuitBreaker(async () => {
      this.logger.log(`Making PUT request to ${url}`);
      const response = await firstValueFrom(
        this.httpService.put<T>(url, data, config),
      );
      return response.data;
    }, serviceName);
  }

  /**
   * Extract service name from URL for circuit breaker tracking
   */
  private getServiceName(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (error) {
      return url.split('/')[0];
    }
  }
}
