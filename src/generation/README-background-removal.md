# Background Removal API

Dedicated API endpoint for removing backgrounds from images using the fal-ai/imageutils/rembg model.

## Overview

This endpoint provides specialized background removal functionality separate from the general image generation API. It's optimized for:

- **Product Photography**: Clean product shots with transparent backgrounds
- **Profile Pictures**: Isolated portraits without distracting backgrounds
- **Design Assets**: Extract objects for compositing and design work
- **E-commerce**: Consistent white or transparent backgrounds

## Key Features

- ✅ **High-Quality Removal**: Advanced edge detection and matting
- ✅ **Transparent PNGs**: Output with alpha channel (transparency)
- ✅ **Optional Cropping**: Crop to bounding box of foreground object
- ✅ **Synchronous Processing**: Wait for completion or async mode
- ✅ **Cost Effective**: 2 credits per operation
- ✅ **S3 Storage**: Permanent cloud storage with CDN delivery
- ✅ **Swagger Documentation**: Interactive API docs at `/api`

## Endpoint

```
POST /generation/remove-background
```

## Authentication

Bearer token required in header:
```
Authorization: Bearer YOUR_TOKEN
```

For testing use: `test-token` (maps to test-user-12345)

## Request Body

```typescript
{
  // Required: URL of the image to process
  image_url: string;
  
  // Optional: Use synchronous processing with FAL
  sync_mode?: boolean;  // default: false
  
  // Optional: Crop output to bounding box of foreground object
  crop_to_bbox?: boolean;  // default: false
  
  // Optional: Wait for processing to complete
  waitForCompletion?: boolean;  // default: true
  
  // Optional: Maximum wait time in milliseconds
  timeoutMs?: number;  // default: 60000 (60 seconds)
}
```

## Response

**Success (200 OK):**
```typescript
{
  success: true,
  assetId: "clx987654321",
  imageUrl: "https://s3.amazonaws.com/.../nobg-uuid.png",
  creditsUsed: 2,
  creditsRemaining: 96,
  model: "fal-ai/imageutils/rembg",
  metadata: {
    width: 1024,
    height: 1024,
    format: "png",
    hasAlpha: true
  }
}
```

**Async Mode (waitForCompletion: false):**
```typescript
{
  success: true,
  assetId: "clx987654321",
  creditsUsed: 2,
  creditsRemaining: 96,
  model: "fal-ai/imageutils/rembg"
}
// Poll GET /generation/assets/{assetId} for completion
```

**Error (400/408/500):**
```typescript
{
  statusCode: 400,
  message: "Invalid image_url: Must be a valid HTTP/HTTPS URL",
  error: "Bad Request"
}
```

## Usage Examples

### 1. Basic Background Removal

```bash
curl -X POST http://localhost:3000/generation/remove-background \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://example.com/product.jpg",
    "waitForCompletion": true
  }'
```

### 2. With Cropping (Tight Crop)

```bash
curl -X POST http://localhost:3000/generation/remove-background \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://example.com/portrait.jpg",
    "crop_to_bbox": true,
    "waitForCompletion": true
  }'
```

### 3. Async Mode (Don't Wait)

```bash
curl -X POST http://localhost:3000/generation/remove-background \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://example.com/image.jpg",
    "waitForCompletion": false
  }'

# Response: { assetId: "clx123...", ... }

# Poll for completion:
curl http://localhost:3000/generation/assets/clx123... \
  -H "Authorization: Bearer test-token"
```

### 4. FAL Sync Mode (Faster Polling)

```bash
curl -X POST http://localhost:3000/generation/remove-background \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://example.com/logo.png",
    "sync_mode": true,
    "crop_to_bbox": false,
    "waitForCompletion": true,
    "timeoutMs": 30000
  }'
```

## Model Details

**Model**: `fal-ai/imageutils/rembg`
- **Category**: Image-to-Image (Utility)
- **Cost**: 2 credits per operation
- **Output**: PNG with alpha channel (transparency)
- **Processing Time**: 5-15 seconds typical
- **Input**: Any image URL (JPEG, PNG, WebP)

## Parameter Details

### `image_url` (required)

URL of the image to process. Must be publicly accessible.

**Supported formats**: JPEG, PNG, WebP, GIF
**Maximum size**: 10MB recommended
**Resolution**: Up to 4096x4096 pixels

**Examples**:
```json
{
  "image_url": "https://example.com/product.jpg"
}
```

### `sync_mode` (optional)

Use FAL's synchronous processing mode for potentially faster completion.

**Default**: `false`
**Type**: boolean

**When to use**:
- Small images (< 1MB)
- Need fastest possible response
- Lower resolution images

### `crop_to_bbox` (optional)

Crop the output image to the bounding box of the detected foreground object.

**Default**: `false`
**Type**: boolean

**Use cases**:
- Product catalogs (consistent sizing)
- Profile pictures (tight crops)
- Icon generation (remove excess space)

**Example**:
```json
{
  "image_url": "https://example.com/portrait.jpg",
  "crop_to_bbox": true
}
```

### `waitForCompletion` (optional)

Wait for the background removal to complete before returning.

**Default**: `true`
**Type**: boolean

**Synchronous (true)**:
- Wait for completion
- Return final image URL
- Timeout after `timeoutMs`

**Asynchronous (false)**:
- Return immediately with assetId
- Poll `/generation/assets/{assetId}` for status
- Webhook support planned

### `timeoutMs` (optional)

Maximum time to wait for completion in milliseconds.

**Default**: `60000` (60 seconds)
**Type**: number
**Range**: 10000-300000 (10s-5m)

**Recommendations**:
- Small images: 30000ms (30s)
- Large images: 60000ms (60s)
- High resolution: 120000ms (2m)

## Error Handling

### Invalid Image URL (400)

```json
{
  "statusCode": 400,
  "message": "Invalid image_url: Must be a valid HTTP/HTTPS URL",
  "error": "Bad Request"
}
```

**Solutions**:
- Ensure URL is publicly accessible
- Check URL format (must start with http:// or https://)
- Verify image is not password protected

### Insufficient Credits (400)

```json
{
  "statusCode": 400,
  "message": "Insufficient credits. Required: 2, Available: 0",
  "error": "Bad Request"
}
```

**Solutions**:
- Purchase more credits
- Check credit balance at `/generation/credits`

### Processing Timeout (408)

```json
{
  "statusCode": 408,
  "message": "Background removal timed out after 60000ms",
  "error": "Request Timeout"
}
```

**Solutions**:
- Increase `timeoutMs` parameter
- Use smaller images
- Try again (might be temporary)
- Use async mode (`waitForCompletion: false`)

### Processing Failed (500)

```json
{
  "success": false,
  "error": "Background removal failed: No foreground detected",
  "creditsRefunded": 2,
  "creditsRemaining": 98
}
```

**Notes**:
- Credits are automatically refunded on failure
- Check error message for details
- Some images may not have detectable foregrounds

## Comparison with General Generation API

| Feature | Background Removal | General Generation |
|---------|-------------------|-------------------|
| Endpoint | `/generation/remove-background` | `/generation/generate-with-credits` |
| Input | Image URL | Prompt or Image URL |
| Output | PNG with transparency | WebP/JPEG/PNG |
| Cost | 2 credits | 1-20 credits (model dependent) |
| Use Case | Utility operation | Creative generation |
| Processing | 5-15 seconds | 10-60 seconds |
| Parameters | 3 simple params | 20+ generation params |

## Asset Management

All background removal operations create Asset records that can be managed:

### List Assets

```bash
GET /generation/assets?modelName=fal-ai/imageutils/rembg
```

### Get Asset Details

```bash
GET /generation/assets/{assetId}
```

### Delete Asset

```bash
DELETE /generation/assets/{assetId}
```

## Testing

Use the provided test file: `background-removal-tests.http`

1. Start the server: `yarn start:dev`
2. Open `background-removal-tests.http` in VS Code
3. Install "REST Client" extension
4. Click "Send Request" above each test

## Integration Examples

### Node.js / TypeScript

```typescript
import axios from 'axios';

async function removeBackground(imageUrl: string) {
  const response = await axios.post(
    'http://localhost:3000/generation/remove-background',
    {
      image_url: imageUrl,
      crop_to_bbox: true,
      waitForCompletion: true,
      timeoutMs: 60000,
    },
    {
      headers: {
        'Authorization': 'Bearer YOUR_TOKEN',
        'Content-Type': 'application/json',
      },
    }
  );
  
  return response.data.imageUrl; // S3 URL of result
}
```

### Python

```python
import requests

def remove_background(image_url: str) -> str:
    response = requests.post(
        'http://localhost:3000/generation/remove-background',
        json={
            'image_url': image_url,
            'crop_to_bbox': True,
            'waitForCompletion': True,
            'timeoutMs': 60000,
        },
        headers={
            'Authorization': 'Bearer YOUR_TOKEN',
            'Content-Type': 'application/json',
        }
    )
    
    data = response.json()
    return data['imageUrl']  # S3 URL of result
```

### cURL

```bash
#!/bin/bash

IMAGE_URL="https://example.com/image.jpg"
TOKEN="YOUR_TOKEN"

curl -X POST http://localhost:3000/generation/remove-background \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"image_url\": \"$IMAGE_URL\",
    \"crop_to_bbox\": true,
    \"waitForCompletion\": true
  }"
```

## Best Practices

1. **Image Quality**: Use high-resolution images for best results
2. **Clear Subjects**: Images with distinct foreground/background work best
3. **Async for Batch**: Use async mode for batch processing
4. **Error Handling**: Always handle timeouts and failures
5. **Credit Monitoring**: Check credit balance regularly
6. **URL Accessibility**: Ensure image URLs are publicly accessible

## Rate Limits

- **Per user**: No hard limit (credits based)
- **Concurrent requests**: 10 max per user
- **Timeout**: 60 seconds default (configurable)

## Storage

- **Location**: AWS S3
- **Format**: PNG (alpha channel)
- **Retention**: Permanent (until deleted)
- **Access**: Public URLs (signed if configured)
- **CDN**: CloudFront for fast delivery

## Monitoring

Track your usage:

```bash
GET /generation/credits
```

Response:
```json
{
  "total": 100,
  "available": 96,
  "used": 4,
  "recentTransactions": [
    {
      "type": "GENERATION_CHARGE",
      "amount": -2,
      "description": "Background removal: fal-ai/imageutils/rembg",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

## Support

- **API Docs**: [http://localhost:3000/api](http://localhost:3000/api)
- **Test File**: `src/generation/background-removal-tests.http`
- **Model Config**: `src/generation/config/image2imageModels.ts`
- **Service**: `src/generation/services/generation.service.ts`

## See Also

- [General Generation API](./README.md)
- [Brand.dev Integration](./README-brand.md)
- [Model Configuration](./config/modelsRegistry.ts)
