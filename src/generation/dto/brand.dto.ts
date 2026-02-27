import { IsString, IsNotEmpty, Matches, IsOptional, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * Brand.dev API DTOs
 * 
 * These DTOs are validated against the official brand.dev library types:
 * - BrandDev.BrandRetrieveParams
 * - BrandDev.BrandAIQueryParams
 * - BrandDev.BrandRetrieveResponse
 * - BrandDev.BrandAIQueryResponse
 * 
 * Reference: node_modules/brand.dev/resources/brand.d.ts
 * 
 * The DTOs add NestJS validation decorators and Swagger documentation
 * while maintaining type compatibility with the brand.dev SDK.
 */

// ========== Request DTOs ==========

/**
 * Request DTO for brand data retrieval
 * Maps to: BrandDev.BrandRetrieveParams (with added forceRefresh for caching)
 */
export class BrandRequestDto {
  @ApiProperty({
    description: 'Domain to fetch brand data from',
    example: 'uniswap.org',
  })
  @IsString()
  @IsNotEmpty()
  domain: string;

  @ApiProperty({
    description: 'Force refresh cache (internal use)',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  forceRefresh?: boolean;

  @ApiProperty({
    description: 'Optimize API call for maximum speed. Skips time-consuming operations for faster response.',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  maxSpeed?: boolean;

  @ApiProperty({
    description: 'Force the language of the retrieved brand data',
    required: false,
    enum: ['english', 'spanish', 'french', 'german', 'italian', 'portuguese', 'russian', 'chinese', 'japanese', 'korean'],
    example: 'english'
  })
  @IsOptional()
  @IsString()
  force_language?: string;

  @ApiProperty({
    description: 'Optional timeout in milliseconds for the request (max 300000ms / 5 minutes)',
    required: false,
    example: 30000,
  })
  @IsOptional()
  timeoutMS?: number;
}

/**
 * Data point DTO for AI query
 * Maps to: BrandDev.BrandAIQueryParams.DataToExtract
 */
export class DataPointDto {
  @ApiProperty({ 
    description: 'Name of the data point',
    example: 'pricing_tier'
  })
  @IsString()
  @IsNotEmpty()
  datapoint_name: string;

  @ApiProperty({ 
    description: 'Description of what to extract',
    example: 'The starting price for the basic plan'
  })
  @IsString()
  @IsNotEmpty()
  datapoint_description: string;

  @ApiProperty({ 
    description: 'Example value (REQUIRED by brand.dev API)',
    example: '$9.99/month'
  })
  @IsString()
  @IsNotEmpty()
  datapoint_example: string;

  @ApiProperty({ 
    description: 'Type of data', 
    enum: ['text', 'number', 'date', 'boolean', 'list', 'url'],
    default: 'text',
    example: 'text'
  })
  @IsOptional()
  @IsString()
  datapoint_type?: 'text' | 'number' | 'date' | 'boolean' | 'list' | 'url';

  @ApiProperty({ 
    description: 'Type of items in the list when datapoint_type is "list"',
    required: false,
    enum: ['string', 'text', 'number', 'date', 'boolean', 'list', 'url', 'object'],
    example: 'string'
  })
  @IsOptional()
  @IsString()
  datapoint_list_type?: 'string' | 'text' | 'number' | 'date' | 'boolean' | 'list' | 'url' | 'object';

  @ApiProperty({ 
    description: 'Schema definition for objects when datapoint_list_type is "object"',
    required: false,
    example: { name: 'string', price: 'number' }
  })
  @IsOptional()
  datapoint_object_schema?: {
    [key: string]: 'string' | 'number' | 'date' | 'boolean';
  };
}

/**
 * Specific pages DTO for AI query
 * Maps to: BrandDev.BrandAIQueryParams.SpecificPages
 */
export class SpecificPagesDto {
  @ApiProperty({ description: 'Analyze the about us page', required: false, default: false })
  @IsOptional()
  @IsBoolean()
  about_us?: boolean;

  @ApiProperty({ description: 'Analyze the blog', required: false, default: false })
  @IsOptional()
  @IsBoolean()
  blog?: boolean;

  @ApiProperty({ description: 'Analyze the careers page', required: false, default: false })
  @IsOptional()
  @IsBoolean()
  careers?: boolean;

  @ApiProperty({ description: 'Analyze the contact us page', required: false, default: false })
  @IsOptional()
  @IsBoolean()
  contact_us?: boolean;

  @ApiProperty({ description: 'Analyze the FAQ page', required: false, default: false })
  @IsOptional()
  @IsBoolean()
  faq?: boolean;

  @ApiProperty({ description: 'Analyze the home page', required: false, default: true })
  @IsOptional()
  @IsBoolean()
  home_page?: boolean;

  @ApiProperty({ description: 'Analyze the pricing page', required: false, default: false })
  @IsOptional()
  @IsBoolean()
  pricing?: boolean;

  @ApiProperty({ description: 'Analyze the privacy policy page', required: false, default: false })
  @IsOptional()
  @IsBoolean()
  privacy_policy?: boolean;

  @ApiProperty({ description: 'Analyze the terms and conditions page', required: false, default: false })
  @IsOptional()
  @IsBoolean()
  terms_and_conditions?: boolean;
}

/**
 * AI Query request DTO
 * Maps to: BrandDev.BrandAIQueryParams (extends BrandRequestDto for shared params)
 */
export class AIQueryRequestDto extends BrandRequestDto {
  @ApiProperty({
    description: 'Array of data points to extract using AI',
    type: [DataPointDto],
    example: [
      {
        datapoint_name: 'pricing',
        datapoint_description: 'Starting price for basic plan',
        datapoint_example: '$9.99',
        datapoint_type: 'text'
      }
    ]
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DataPointDto)
  data_to_extract: DataPointDto[];

  @ApiProperty({
    description: 'Specific pages to query',
    required: false,
    type: SpecificPagesDto,
    example: { 
      home_page: true,
      pricing: true, 
      about_us: true 
    }
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SpecificPagesDto)
  specific_pages?: SpecificPagesDto;
}

// ========== Response DTOs ==========

export class ColorDto {
  @ApiProperty({ example: '#FF5733' })
  hex: string;

  @ApiProperty({ required: false, example: 'Primary Red' })
  name?: string;

  @ApiProperty({ required: false, example: 'primary' })
  type?: string;
}

export class LogoDto {
  @ApiProperty({ example: 'https://example.com/logo.png' })
  url: string;

  @ApiProperty({ required: false, example: 'primary' })
  type?: string;

  @ApiProperty({ required: false, example: 'png' })
  format?: string;
}

export class FontDto {
  @ApiProperty({ example: 'Inter' })
  name: string;

  @ApiProperty({ required: false, example: '400' })
  weight?: string;

  @ApiProperty({ required: false, example: 'https://fonts.google.com/...' })
  url?: string;
}

export class BrandDataDto {
  @ApiProperty({ example: 'uniswap.org' })
  domain: string;

  @ApiProperty({ required: false, example: 'Uniswap' })
  name?: string;

  @ApiProperty({ required: false, example: 'A leading decentralized exchange protocol' })
  description?: string;

  @ApiProperty({ type: [ColorDto], required: false })
  colors?: ColorDto[];

  @ApiProperty({ type: [LogoDto], required: false })
  logos?: LogoDto[];

  @ApiProperty({ type: [FontDto], required: false })
  fonts?: FontDto[];

  @ApiProperty({ required: false })
  metadata?: Record<string, any>;
}

export class BrandResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: BrandDataDto, required: false })
  brand?: BrandDataDto;

  @ApiProperty({ 
    type: [String], 
    required: false,
    example: ['#FF007A', '#FFFFFF', '#131313']
  })
  colors?: string[];

  @ApiProperty({ 
    type: [String], 
    required: false,
    example: ['https://uniswap.org/logo.png']
  })
  logos?: string[];

  @ApiProperty({ required: false, example: 'A leading decentralized exchange' })
  description?: string;

  @ApiProperty({ required: false, example: 'Service unavailable' })
  error?: string;

  @ApiProperty({ required: false, example: false })
  cached?: boolean;

  @ApiProperty({ required: false, example: '2026-02-17T10:30:00Z' })
  timestamp?: Date;
}

export class AIQueryResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ required: false })
  data?: any;

  @ApiProperty({ required: false })
  error?: string;

  @ApiProperty({ required: false })
  timestamp?: Date;
}
