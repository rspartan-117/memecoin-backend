# Brand.dev API Integration

Production-ready NestJS service for accessing brand.dev API to retrieve brand assets, logos, colors, fonts, and AI-powered data extraction.

## Features

- ✅ **Brand Asset Retrieval**: Fetch logos, colors, fonts, and metadata
- ✅ **AI-Powered Data Extraction**: Extract custom data points from any website
- ✅ **In-Memory Caching**: 1-hour TTL to reduce API costs
- ✅ **TypeScript Type Safety**: Full type definitions matching brand.dev API
- ✅ **Comprehensive Validation**: DTOs with class-validator
- ✅ **Swagger Documentation**: Auto-generated API docs
- ✅ **Health Monitoring**: Service health and cache statistics endpoints

## Setup

### 1. Install Package (Already Done)
```bash
yarn add brand.dev
```

### 2. Configure API Key
Add to your `.env` file:
```bash
BRAND_DEV_API_KEY=your_brand_dev_api_key_here
```

Get your API key from [brand.dev](https://brand.dev)

## API Endpoints

### 1. Retrieve Brand Data

Fetch comprehensive brand assets for any domain.

**Endpoint**: `POST /brand/retrieve`

**Request Body**:
```json
{
  "domain": "uniswap.org",
  "forceRefresh": false,
  "maxSpeed": false,
  "force_language": "english",
  "timeoutMS": 30000
}
```

**Parameters**:
- `domain` (required): Domain to fetch brand data from (e.g., "uniswap.org", "stripe.com")
- `forceRefresh` (optional): Bypass cache and force fresh fetch from API
- `maxSpeed` (optional): Optimize for speed, skip time-consuming operations
- `force_language` (optional): Force specific language for brand data
- `timeoutMS` (optional): Request timeout in milliseconds (max 300000 = 5 minutes)

**Response Example**:
```json
{
  "success": true,
  "brand": {
    "domain": "uniswap.org",
    "title": "Uniswap",
    "description": "A leading decentralized cryptocurrency exchange",
    "colors": [
      { "hex": "#FF007A", "name": "Pink" },
      { "hex": "#FFFFFF", "name": "White" },
      { "hex": "#131313", "name": "Black" }
    ],
    "logos": [
      {
        "url": "https://cdn.brand.dev/...",
        "type": "logo",
        "mode": "light",
        "resolution": { "width": 512, "height": 512 }
      }
    ],
    "fonts": [
      { "name": "Inter", "weight": "400" }
    ],
    "links": {
      "careers": "https://uniswap.org/careers",
      "blog": "https://uniswap.org/blog",
      "pricing": null
    }
  },
  "colors": ["#FF007A", "#FFFFFF", "#131313"],
  "logos": ["https://cdn.brand.dev/..."],
  "description": "A leading decentralized cryptocurrency exchange",
  "cached": false,
  "timestamp": "2026-02-17T10:30:00Z"
}
```

### 2. AI-Powered Website Query

Extract custom data points from any company website using AI.

**Endpoint**: `POST /brand/ai-query`

**Request Body**:
```json
{
  "domain": "stripe.com",
  "data_to_extract": [
    {
      "datapoint_name": "starting_price",
      "datapoint_description": "The starting price for the basic plan",
      "datapoint_example": "$9.99",
      "datapoint_type": "text"
    },
    {
      "datapoint_name": "features_list",
      "datapoint_description": "List of key product features",
      "datapoint_example": "Feature 1",
      "datapoint_type": "list",
      "datapoint_list_type": "string"
    },
    {
      "datapoint_name": "team_size",
      "datapoint_description": "Number of employees",
      "datapoint_example": "100",
      "datapoint_type": "number"
    },
    {
      "datapoint_name": "founded_date",
      "datapoint_description": "Company founding date",
      "datapoint_example": "2010-01-15",
      "datapoint_type": "date"
    }
  ],
  "specific_pages": {
    "home_page": true,
    "pricing": true,
    "about_us": true,
    "careers": false,
    "blog": false
  },
  "timeoutMS": 60000
}
```

**Parameters**:
- `domain` (required): Domain to query
- `data_to_extract` (required): Array of data points to extract
  - `datapoint_name` (required): Identifier for the extracted data
  - `datapoint_description` (required): Natural language description of what to extract
  - `datapoint_example` (required): Example value to guide the AI
  - `datapoint_type` (optional): Data type - `text`, `number`, `date`, `boolean`, `list`, `url`
  - `datapoint_list_type` (optional): For lists - type of list items
  - `datapoint_object_schema` (optional): For object arrays - schema definition
- `specific_pages` (optional): Which pages to analyze
  - `home_page`, `pricing`, `about_us`, `careers`, `blog`, `faq`, `contact_us`, `privacy_policy`, `terms_and_conditions`
- `timeoutMS` (optional): Request timeout in milliseconds

**Response Example**:
```json
{
  "success": true,
  "data": {
    "starting_price": "$29/month",
    "features_list": [
      "Payment processing",
      "Subscription management",
      "Global payments",
      "Fraud prevention"
    ],
    "team_size": 8000,
    "founded_date": "2010-01-15"
  },
  "timestamp": "2026-02-17T10:32:00Z"
}
```

### 3. Health Check

Check service configuration and status.

**Endpoint**: `GET /brand/health`

**Response**:
```json
{
  "configured": true,
  "apiKeyPresent": true,
  "cacheStats": {
    "totalEntries": 5,
    "validEntries": 5,
    "expiredEntries": 0,
    "cacheTTL": 3600,
    "domains": ["uniswap.org", "stripe.com"]
  }
}
```

### 4. Cache Statistics

Get detailed cache metrics.

**Endpoint**: `GET /brand/cache/stats`

### 5. Clear Cache

Clear cached brand data.

**Endpoint**: `DELETE /brand/cache?domain=uniswap.org`

**Query Parameters**:
- `domain` (optional): Specific domain to clear. If omitted, clears all cache.

## Usage Examples

### cURL Examples

#### 1. Basic Brand Retrieval
```bash
curl -X POST http://localhost:3000/brand/retrieve \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "domain": "uniswap.org"
  }'
```

#### 2. AI Query with Multiple Data Points
```bash
curl -X POST http://localhost:3000/brand/ai-query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "domain": "stripe.com",
    "data_to_extract": [
      {
        "datapoint_name": "pricing",
        "datapoint_description": "Starting price for the basic payment processing plan",
        "datapoint_example": "$29/month",
        "datapoint_type": "text"
      },
      {
        "datapoint_name": "supported_countries",
        "datapoint_description": "Number of countries supported",
        "datapoint_example": "195",
        "datapoint_type": "number"
      }
    ],
    "specific_pages": {
      "home_page": true,
      "pricing": true
    }
  }'
```

### TypeScript/JavaScript Client

```typescript
import axios from 'axios';

const client = axios.create({
  baseURL: 'http://localhost:3000',
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  }
});

// Retrieve brand data
const brandData = await client.post('/brand/retrieve', {
  domain: 'uniswap.org',
  maxSpeed: true
});

console.log('Logos:', brandData.data.logos);
console.log('Colors:', brandData.data.colors);

// AI-powered data extraction
const aiQuery = await client.post('/brand/ai-query', {
  domain: 'stripe.com',
  data_to_extract: [
    {
      datapoint_name: 'pricing',
      datapoint_description: 'Starting monthly price',
      datapoint_example: '$9.99',
      datapoint_type: 'text'
    }
  ]
});

console.log('Extracted data:', aiQuery.data.data);
```

## Data Types for AI Query

The `datapoint_type` field supports the following types:

- **`text`**: Plain text strings
- **`number`**: Numeric values (integers, decimals)
- **`date`**: Date values (ISO format recommended)
- **`boolean`**: True/false values
- **`list`**: Arrays of items (specify `datapoint_list_type`)
- **`url`**: Web URLs

### List Type Examples

Extract a simple list:
```json
{
  "datapoint_name": "features",
  "datapoint_description": "Product features",
  "datapoint_example": "Real-time updates",
  "datapoint_type": "list",
  "datapoint_list_type": "string"
}
```

Extract a list of objects:
```json
{
  "datapoint_name": "team_members",
  "datapoint_description": "Leadership team",
  "datapoint_example": "John Doe",
  "datapoint_type": "list",
  "datapoint_list_type": "object",
  "datapoint_object_schema": {
    "name": "string",
    "role": "string",
    "years": "number"
  }
}
```

## Caching Strategy

- **Cache Duration**: 1 hour (3600 seconds)
- **Cache Key**: `brand:{normalized_domain}`
- **Storage**: In-memory Map (consider Redis for production)
- **Invalidation**: Automatic cleanup of expired entries
- **Force Refresh**: Use `forceRefresh: true` to bypass cache

**Cache Benefits**:
- Reduces API costs (brand.dev charges $0.006-$0.019 per call)
- Respects rate limits (2-20 calls/second depending on plan)
- Improves response time for cached domains

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message description",
  "timestamp": "2026-02-17T10:30:00Z"
}
```

**Common HTTP Status Codes**:
- `200`: Success
- `400`: Bad Request (validation error)
- `503`: Service Unavailable (API key not configured)
- `500`: Internal Server Error

## Best Practices

1. **Cache First**: Don't use `forceRefresh` unless absolutely necessary
2. **Provide Examples**: Always include meaningful `datapoint_example` values for better AI accuracy
3. **Specific Pages**: Specify only the pages you need to reduce processing time
4. **Timeout Management**: Set appropriate `timeoutMS` based on your needs (AI queries can take 30-60 seconds)
5. **Type Accuracy**: Use the correct `datapoint_type` for better extraction results
6. **Error Recovery**: Implement retry logic with exponential backoff for production use

## Performance Tips

- Use `maxSpeed: true` for faster responses when you don't need comprehensive data
- Specify `specific_pages` to limit AI query scope
- Set reasonable `timeoutMS` values (30-60 seconds for AI queries)
- Monitor cache hit rates with `/brand/cache/stats`

## Cost Optimization

Brand.dev API pricing (as of 2026):
- **Basic Plan**: $0.019 per call, 2 calls/second
- **Pro Plan**: $0.006 per call, 20 calls/second

With 1-hour caching:
- **Without caching**: 1000 requests = $6-19
- **With caching (80% hit rate)**: 200 API calls = $1.20-3.80

## Troubleshooting

### API Key Not Configured
```
Error: BRAND_DEV_API_KEY not configured
```
**Solution**: Add `BRAND_DEV_API_KEY` to your `.env` file

### Type Errors
```
Error: datapoint_example is required
```
**Solution**: Ensure all data points have a `datapoint_example` value

### Timeout Errors
```
Error: Request timeout (408)
```
**Solution**: Increase `timeoutMS` or use `maxSpeed: true`

## Architecture

```
┌─────────────────┐
│ BrandController │ ← REST API endpoints
└────────┬────────┘
         │
┌────────▼────────┐
│  BrandService   │ ← Business logic, caching
└────────┬────────┘
         │
┌────────▼────────┐
│  BrandDev SDK   │ ← Official brand.dev client
└─────────────────┘
```

## Files Structure

```
src/generation/
├── dto/
│   └── brand.dto.ts              # Request/Response DTOs
├── services/
│   └── brand.service.ts          # Core service with caching
├── controllers/
│   └── brand.controller.ts       # REST API endpoints
└── generation.module.ts          # Module registration
```

## Future Enhancements

- [ ] Redis caching for distributed systems
- [ ] Rate limiting implementation
- [ ] Webhook support for async processing
- [ ] Batch request support
- [ ] Response data transformation pipelines
- [ ] Mastra tool integration for AI agents

## Support

For brand.dev API documentation: https://docs.brand.dev
For issues with this integration: Contact your development team
