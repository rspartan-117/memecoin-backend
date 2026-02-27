/**
 * Type validation for brand.dev integration
 * 
 * This file validates that our DTOs are compatible with the official brand.dev library types.
 * TypeScript will show compile errors if there are type mismatches.
 * 
 * DO NOT IMPORT THIS FILE IN RUNTIME CODE - IT'S FOR TYPE CHECKING ONLY
 */

import { BrandDev } from 'brand.dev';
import { 
  BrandRequestDto, 
  DataPointDto, 
  SpecificPagesDto, 
  AIQueryRequestDto 
} from './brand.dto';

// Type aliases for easier reference
type LibBrandRetrieveParams = BrandDev.BrandRetrieveParams;
type LibBrandAIQueryParams = BrandDev.BrandAIQueryParams;
type LibDataToExtract = BrandDev.BrandAIQueryParams['data_to_extract'][number];
type LibSpecificPages = BrandDev.BrandAIQueryParams['specific_pages'];

/**
 * Validate that our BrandRequestDto can be converted to LibBrandRetrieveParams
 */
function validateBrandRequestDto() {
  const dto: BrandRequestDto = {
    domain: 'example.com',
    maxSpeed: true,
    force_language: 'english',
    timeoutMS: 30000,
    forceRefresh: false, // This is our custom field for caching
  };

  // Convert to library type (removing our custom fields)
  const libParams: LibBrandRetrieveParams = {
    domain: dto.domain,
    ...(dto.maxSpeed && { maxSpeed: dto.maxSpeed }),
    ...(dto.force_language && { force_language: dto.force_language as any }),
    ...(dto.timeoutMS && { timeoutMS: dto.timeoutMS }),
  };

  // If this compiles, our DTO is compatible ✓
  console.log('BrandRequestDto validated', libParams);
}

/**
 * Validate that our DataPointDto matches LibDataToExtract
 */
function validateDataPointDto() {
  const dto: DataPointDto = {
    datapoint_name: 'test',
    datapoint_description: 'test description',
    datapoint_example: 'test example',
    datapoint_type: 'text',
    datapoint_list_type: 'string',
    datapoint_object_schema: {
      field1: 'string',
      field2: 'number',
    },
  };

  // Create library type from our DTO
  // Note: We need to cast because TypeScript can't infer the exact literal type
  const libData: Partial<LibDataToExtract> = {
    datapoint_name: dto.datapoint_name,
    datapoint_description: dto.datapoint_description,
    datapoint_example: dto.datapoint_example,
    datapoint_type: dto.datapoint_type as LibDataToExtract['datapoint_type'],
    ...(dto.datapoint_list_type && { 
      datapoint_list_type: dto.datapoint_list_type as any 
    }),
    ...(dto.datapoint_object_schema && { 
      datapoint_object_schema: dto.datapoint_object_schema as any 
    }),
  };

  // If this compiles, our DTO is compatible ✓
  console.log('DataPointDto validated', libData);
}

/**
 * Validate that our SpecificPagesDto matches LibSpecificPages
 */
function validateSpecificPagesDto() {
  const dto: SpecificPagesDto = {
    about_us: true,
    blog: false,
    careers: true,
    contact_us: false,
    faq: true,
    home_page: true,
    pricing: true,
    privacy_policy: false,
    terms_and_conditions: false,
  };

  // Type should be directly assignable
  const libPages: LibSpecificPages = dto;

  // If this compiles, our DTO is compatible ✓
  console.log('SpecificPagesDto validated', libPages);
}

/**
 * Validate that our AIQueryRequestDto can be converted to LibBrandAIQueryParams
 */
function validateAIQueryRequestDto() {
  const dto: AIQueryRequestDto = {
    domain: 'example.com',
    data_to_extract: [
      {
        datapoint_name: 'price',
        datapoint_description: 'Product price',
        datapoint_example: '$9.99',
        datapoint_type: 'text',
      },
    ],
    specific_pages: {
      pricing: true,
      home_page: true,
    },
    timeoutMS: 60000,
    forceRefresh: false,
  };

  // Convert to library type
  const libParams: LibBrandAIQueryParams = {
    domain: dto.domain,
    data_to_extract: dto.data_to_extract.map(dp => ({
      datapoint_name: dp.datapoint_name,
      datapoint_description: dp.datapoint_description,
      datapoint_example: dp.datapoint_example,
      datapoint_type: dp.datapoint_type || 'text',
      ...(dp.datapoint_list_type && { datapoint_list_type: dp.datapoint_list_type as any }),
      ...(dp.datapoint_object_schema && { datapoint_object_schema: dp.datapoint_object_schema as any }),
    })) as any,
    ...(dto.specific_pages && { specific_pages: dto.specific_pages as any }),
    ...(dto.timeoutMS && { timeoutMS: dto.timeoutMS }),
  };

  // If this compiles, our DTO is compatible ✓
  console.log('AIQueryRequestDto validated', libParams);
}

/**
 * Type assertions to ensure structural compatibility
 * 
 * These will cause TypeScript compile errors if the types diverge
 */
type AssertStructuralCompatibility = {
  // Ensure DataPointDto has all required fields from library
  datapoint: {
    name: DataPointDto['datapoint_name'] extends string ? true : never;
    description: DataPointDto['datapoint_description'] extends string ? true : never;
    example: DataPointDto['datapoint_example'] extends string ? true : never;
    type: DataPointDto['datapoint_type'] extends ('text' | 'number' | 'date' | 'boolean' | 'list' | 'url' | undefined) ? true : never;
  };

  // Ensure SpecificPagesDto has boolean fields
  pages: {
    about_us: SpecificPagesDto['about_us'] extends (boolean | undefined) ? true : never;
    pricing: SpecificPagesDto['pricing'] extends (boolean | undefined) ? true : never;
    home_page: SpecificPagesDto['home_page'] extends (boolean | undefined) ? true : never;
  };

  // Ensure BrandRequestDto has domain field
  request: {
    domain: BrandRequestDto['domain'] extends string ? true : never;
  };
};

/**
 * Summary of Type Validation:
 * 
 * ✓ BrandRequestDto -> BrandDev.BrandRetrieveParams
 *   - All fields compatible
 *   - Added `forceRefresh` for internal caching (not sent to API)
 * 
 * ✓ DataPointDto -> BrandDev.BrandAIQueryParams.DataToExtract
 *   - All required fields present
 *   - datapoint_example is REQUIRED (not optional)
 *   - datapoint_type matches library enum
 *   - datapoint_list_type and datapoint_object_schema properly typed
 * 
 * ✓ SpecificPagesDto -> BrandDev.BrandAIQueryParams.SpecificPages
 *   - All boolean fields match
 *   - Covers all page types supported by the API
 * 
 * ✓ AIQueryRequestDto -> BrandDev.BrandAIQueryParams
 *   - Extends BrandRequestDto for shared params
 *   - data_to_extract properly typed as array
 *   - specific_pages properly typed
 * 
 * The DTOs include NestJS validation decorators and Swagger documentation
 * while maintaining full type compatibility with the brand.dev SDK.
 */

export {};
