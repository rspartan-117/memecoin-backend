import { 
  Injectable, 
  Logger, 
  HttpException, 
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrandDev } from 'brand.dev';
import { 
  BrandRequestDto, 
  AIQueryRequestDto,
  BrandResponseDto,
  AIQueryResponseDto,
  BrandDataDto 
} from '../dto/brand.dto';

// Import types from BrandDev namespace
type BrandRetrieveParams = BrandDev.BrandRetrieveParams;
type BrandRetrieveResponse = BrandDev.BrandRetrieveResponse;
type BrandAIQueryParams = BrandDev.BrandAIQueryParams;
type BrandAIQueryResponse = BrandDev.BrandAIQueryResponse;

@Injectable()
export class BrandService {
  private readonly logger = new Logger(BrandService.name);
  private readonly client: BrandDev;
  private readonly apiKey: string;
  private readonly cache = new Map<string, { data: BrandResponseDto; timestamp: number }>();
  private readonly CACHE_TTL = 3600000; // 1 hour in milliseconds
  private static readonly CACHE_PREFIX = 'brand:';

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('BRAND_DEV_API_KEY') || '';
    
    if (!this.apiKey) {
      this.logger.warn('⚠️  BRAND_DEV_API_KEY not configured. Brand service will not work.');
    } else {
      this.logger.log('✅ Brand.dev API configured successfully');
    }

    this.client = new BrandDev({
      apiKey: this.apiKey,
    });

    // Cleanup expired cache entries every hour
    setInterval(() => this.cleanupCache(), this.CACHE_TTL);
  }

  /**
   * Get brand data for a domain with caching support
   */
  async getBrandData(request: BrandRequestDto): Promise<BrandResponseDto> {
    const startTime = Date.now();
    const { domain, forceRefresh } = request;

    try {
      // Validate API key
      if (!this.isConfigured()) {
        throw new HttpException(
          'BRAND_DEV_API_KEY not configured',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      // Normalize domain
      const normalizedDomain = this.normalizeDomain(domain);
      this.logger.debug(`Fetching brand data for: ${normalizedDomain}`);

      // Check cache unless force refresh
      if (!forceRefresh) {
        const cached = this.getCachedBrand(normalizedDomain);
        if (cached) {
          const duration = Date.now() - startTime;
          this.logger.log(`✅ Cache hit for ${normalizedDomain} (${duration}ms)`);
          return cached;
        }
      }

      // Fetch from API - using library's native types
      const params: BrandRetrieveParams = {
        domain: normalizedDomain,
        ...(request.maxSpeed && { maxSpeed: request.maxSpeed }),
        ...(request.force_language && { force_language: request.force_language as any }),
        ...(request.timeoutMS && { timeoutMS: request.timeoutMS }),
      };
      
      const response: BrandRetrieveResponse = await this.client.brand.retrieve(params);
      const { brand } = response;

      if (!brand) {
        this.logger.warn(`❌ No brand data found for ${normalizedDomain}`);
        return {
          success: false,
          error: `No brand data found for ${normalizedDomain}`,
          timestamp: new Date(),
        };
      }

      // Transform and prepare response
      const result = this.transformBrandData(brand as BrandDataDto);

      // Cache the result
      this.cacheBrandData(normalizedDomain, result);

      const duration = Date.now() - startTime;
      this.logger.log(
        `✅ Successfully fetched brand data for ${normalizedDomain} (${duration}ms) - ` +
        `${result.colors?.length || 0} colors, ${result.logos?.length || 0} logos`
      );

      return result;
    } catch (error) {
      this.logger.error(`❌ Error fetching brand data for ${domain}:`, error.message);
      
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          error: error.message || 'Failed to fetch brand data',
          timestamp: new Date(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Query brand website with AI to extract custom data points
   */
  async queryBrandWithAI(request: AIQueryRequestDto): Promise<AIQueryResponseDto> {
    const startTime = Date.now();

    try {
      if (!this.isConfigured()) {
        throw new HttpException(
          'BRAND_DEV_API_KEY not configured',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      const normalizedDomain = this.normalizeDomain(request.domain);
      this.logger.debug(`🤖 AI Query for ${normalizedDomain} with ${request.data_to_extract.length} data points`);

      // Build params using library's native types
      const params: BrandAIQueryParams = {
        domain: normalizedDomain,
        data_to_extract: request.data_to_extract.map(dp => ({
          datapoint_name: dp.datapoint_name,
          datapoint_description: dp.datapoint_description,
          datapoint_example: dp.datapoint_example,
          datapoint_type: dp.datapoint_type || 'text',
          ...(dp.datapoint_list_type && { datapoint_list_type: dp.datapoint_list_type }),
          ...(dp.datapoint_object_schema && { datapoint_object_schema: dp.datapoint_object_schema }),
        })) as any,
        ...(request.specific_pages && { specific_pages: request.specific_pages as any }),
        ...(request.timeoutMS && { timeoutMS: request.timeoutMS }),
      };

      const response: BrandAIQueryResponse = await this.client.brand.aiQuery(params);

      const duration = Date.now() - startTime;
      this.logger.log(`✅ AI Query completed for ${normalizedDomain} (${duration}ms)`);

      return {
        success: true,
        data: response,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`❌ AI Query error for ${request.domain}:`, error.message);
      
      throw new HttpException(
        {
          success: false,
          error: error.message || 'AI query failed',
          timestamp: new Date(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Clear cache for a specific domain or all domains
   */
  async clearCache(domain?: string): Promise<{ cleared: number }> {
    if (domain) {
      const normalizedDomain = this.normalizeDomain(domain);
      const cacheKey = `${BrandService.CACHE_PREFIX}${normalizedDomain}`;
      const deleted = this.cache.delete(cacheKey);
      this.logger.log(`🗑️  Cache cleared for ${normalizedDomain}`);
      return { cleared: deleted ? 1 : 0 };
    } else {
      const size = this.cache.size;
      this.cache.clear();
      this.logger.log(`🗑️  All brand cache cleared (${size} entries)`);
      return { cleared: size };
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    const entries = Array.from(this.cache.entries());
    const now = Date.now();
    const validEntries = entries.filter(([_, value]) => (now - value.timestamp) < this.CACHE_TTL);
    
    return {
      totalEntries: this.cache.size,
      validEntries: validEntries.length,
      expiredEntries: this.cache.size - validEntries.length,
      cacheTTL: this.CACHE_TTL / 1000, // in seconds
      domains: validEntries.map(([key]) => key.replace(BrandService.CACHE_PREFIX, '')),
    };
  }

  /**
   * Check if API is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  // ========== Private Helper Methods ==========

  private transformBrandData(brand: BrandDataDto): BrandResponseDto {
    const colors = brand.colors?.map((c) => c.hex) || [];
    const logos = brand.logos?.map((l) => l.url) || [];
    const description = brand.description || '';

    return {
      success: true,
      brand: brand,
      colors: colors,
      logos: logos,
      description: description,
      cached: false,
      timestamp: new Date(),
    };
  }

  private getCachedBrand(domain: string): BrandResponseDto | null {
    try {
      const cacheKey = `${BrandService.CACHE_PREFIX}${domain}`;
      const cached = this.cache.get(cacheKey);
      
      if (cached) {
        const age = Date.now() - cached.timestamp;
        if (age < this.CACHE_TTL) {
          return {
            ...cached.data,
            cached: true,
          };
        } else {
          // Remove expired entry
          this.cache.delete(cacheKey);
        }
      }
      
      return null;
    } catch (error) {
      this.logger.warn(`⚠️  Cache retrieval error for ${domain}:`, error.message);
      return null;
    }
  }

  private cacheBrandData(domain: string, data: BrandResponseDto): void {
    try {
      const cacheKey = `${BrandService.CACHE_PREFIX}${domain}`;
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now(),
      });
      this.logger.debug(`💾 Cached brand data for ${domain}`);
    } catch (error) {
      this.logger.warn(`⚠️  Cache storage error for ${domain}:`, error.message);
    }
  }

  private normalizeDomain(domain: string): string {
    return domain
      .toLowerCase()
      .replace(/^(https?:\/\/)?(www\.)?/, '')
      .replace(/\/$/, '')
      .trim();
  }

  private cleanupCache(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp >= this.CACHE_TTL) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`🧹 Cleaned up ${cleaned} expired cache entries`);
    }
  }
}
