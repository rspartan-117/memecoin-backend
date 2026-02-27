import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  Delete,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { BrandService } from '../services/brand.service';
import { 
  BrandRequestDto, 
  AIQueryRequestDto,
  BrandResponseDto,
  AIQueryResponseDto 
} from '../dto/brand.dto';

@ApiBearerAuth()
@ApiTags('brand')
@Controller('brand')
export class BrandController {
  constructor(private readonly brandService: BrandService) {}

  @Post('retrieve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Retrieve brand data for a domain',
    description: `Fetches comprehensive brand assets including:
    • Logos (primary, secondary, favicon)
    • Color palettes (primary, secondary, accent colors)
    • Typography (fonts and weights)
    • Brand metadata and description
    
    Results are cached for 1 hour to optimize performance and reduce API costs.
    Use forceRefresh=true to bypass cache.`
  })
  @ApiResponse({
    status: 200,
    description: 'Brand data retrieved successfully',
    type: BrandResponseDto,
    example: {
      success: true,
      brand: {
        domain: 'uniswap.org',
        name: 'Uniswap',
        description: 'A leading decentralized exchange protocol',
        colors: [{ hex: '#FF007A', name: 'Pink', type: 'primary' }],
        logos: [{ url: 'https://...', type: 'primary', format: 'svg' }],
        fonts: [{ name: 'Inter', weight: '400' }]
      },
      colors: ['#FF007A', '#FFFFFF', '#131313'],
      logos: ['https://uniswap.org/logo.svg'],
      description: 'A leading decentralized exchange protocol',
      cached: false,
      timestamp: '2026-02-17T10:30:00Z'
    }
  })
  @ApiResponse({
    status: 503,
    description: 'API key not configured',
    example: {
      success: false,
      error: 'BRAND_DEV_API_KEY not configured'
    }
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
  })
  async retrieveBrand(
    @Body() request: BrandRequestDto,
  ): Promise<BrandResponseDto> {
    return this.brandService.getBrandData(request);
  }

  @Post('ai-query')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Query brand website with AI',
    description: `Extract custom data points from any company website using AI-powered scraping.
    
    Use cases:
    • Extract pricing information
    • Get feature lists
    • Scrape team/about information
    • Pull any structured data from website
    
    You define what data to extract using natural language descriptions.`
  })
  @ApiResponse({
    status: 200,
    description: 'AI query completed successfully',
    type: AIQueryResponseDto,
    example: {
      success: true,
      data: {
        pricing_tier: '$9.99/month',
        features: ['Real-time collaboration', 'Unlimited projects', 'Priority support'],
        team_size: '50-100 employees'
      },
      timestamp: '2026-02-17T10:30:00Z'
    }
  })
  @ApiResponse({
    status: 503,
    description: 'API key not configured',
  })
  async aiQuery(@Body() request: AIQueryRequestDto): Promise<AIQueryResponseDto> {
    return this.brandService.queryBrandWithAI(request);
  }

  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Check brand service health',
    description: 'Returns API configuration status and cache statistics'
  })
  @ApiResponse({
    status: 200,
    description: 'Service health information',
    example: {
      configured: true,
      apiKeyPresent: true,
      cacheStats: {
        totalEntries: 5,
        validEntries: 5,
        expiredEntries: 0,
        cacheTTL: 3600,
        domains: ['uniswap.org', 'stripe.com']
      }
    }
  })
  async getHealth() {
    const isConfigured = this.brandService.isConfigured();
    const cacheStats = this.brandService.getCacheStats();

    return {
      configured: isConfigured,
      apiKeyPresent: !!isConfigured,
      cacheStats,
    };
  }

  @Get('cache/stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Get cache statistics',
    description: 'Returns detailed cache metrics and stored domains'
  })
  @ApiResponse({
    status: 200,
    description: 'Cache statistics',
  })
  async getCacheStats() {
    return this.brandService.getCacheStats();
  }

  @Delete('cache')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Clear brand cache',
    description: 'Clear cache for a specific domain or all cached domains'
  })
  @ApiQuery({
    name: 'domain',
    required: false,
    description: 'Specific domain to clear. If omitted, clears all cache.',
    example: 'uniswap.org'
  })
  @ApiResponse({
    status: 200,
    description: 'Cache cleared successfully',
    example: {
      cleared: 5,
      message: 'Cache cleared successfully'
    }
  })
  async clearCache(@Query('domain') domain?: string) {
    const result = await this.brandService.clearCache(domain);
    return {
      ...result,
      message: domain 
        ? `Cache cleared for ${domain}` 
        : 'All cache cleared',
    };
  }
}
