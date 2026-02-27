# Generation API Routes Documentation

Complete reference for all image generation API endpoints with real-world use cases and examples.

## Table of Contents

1. [Authentication](#authentication)
2. [POST /generation/text-to-image](#2-post-generationtext-to-image)
3. [POST /generation/image-to-image](#3-post-generationimage-to-image)
4. [POST /generation/remove-background](#4-post-generationremove-background)
5. [GET /generation/credits](#5-get-generationcredits)
6. [GET /generation/status/:falRequestId](#6-get-generationstatusfal-request-id)
7. [GET /generation/user/generations](#7-get-generationusergenerations)
8. [GET /generation/results](#8-get-generationresults)
9. [GET /generation/:id](#9-get-generationid)
10. [DELETE /generation/:generationId](#10-delete-generationgenerationid)
11. [POST /generation/bulk-delete](#11-post-generationbulk-delete)
12. [GET /generation/config/status](#12-get-generationconfigstatus)
13. [POST /generation/webhook/result](#13-post-generationwebhookresult)
14. [POST /brand/retrieve](#14-post-brandretrieve)
15. [POST /brand/ai-query](#15-post-brandai-query)
16. [GET /brand/health](#16-get-brandhealth)
17. [GET /brand/cache/stats](#17-get-brandcachestats)
18. [DELETE /brand/cache](#18-delete-brandcache)

---

## Authentication

All endpoints require Bearer token authentication:

```http
Authorization: Bearer test-token
```

For development, use the test user token: `test-token`

---

## 2. POST /generation/text-to-image

**Generate images from text prompts** with proper validation and type safety.

### Endpoint
```
POST /generation/text-to-image
```

### Use Cases
- **Meme Coin Branding**: Create unique logos and mascots for crypto projects
- **Marketing Materials**: Generate promotional images for social media
- **Concept Art**: Visualize ideas for games, apps, or products
- **Content Creation**: Bulk image generation for blogs, newsletters, websites

### Supported Models

| Model | Credits | Speed | Quality | Best For |
|-------|---------|-------|---------|----------|
| `fal-ai/flux-2/dev` | 2 | Medium | High | Versatile, photorealistic |
| `fal-ai/nano-banana` | 1 | Fast | Good | Quick iterations, cost-effective |
| `fal-ai/nano-banana-pro` | 2 | Fast | Premium | Best quality + speed balance |
| `fal-ai/recraft-v3` | 2 | Medium | Premium | Style-focused, artistic control |

### Request Body
```json
{
  "modelName": "fal-ai/flux-2/dev",
  "params": {
    "prompt": "Cartoon dog mascot wearing sunglasses, riding a rocket to the moon, vibrant colors, meme coin style, professional logo design",
    "image_size": "square",
    "num_inference_steps": 28,
    "guidance_scale": 3.5,
    "enable_safety_checker": true,
    "seed": 42
  },
  "waitForCompletion": true,
  "timeoutMs": 120000
}
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `modelName` | string | Yes | - | Model to use (see table above) |
| `params.prompt` | string | Yes | - | Text description of desired image |
| `params.image_size` | string | No | `square_hd` | Size: `square_hd`, `square`, `portrait_4_3`, `portrait_16_9`, `landscape_4_3`, `landscape_16_9` |
| `params.num_inference_steps` | number | No | 28 | Quality vs speed (4-50, higher = better quality) |
| `params.guidance_scale` | number | No | 3.5 | Prompt adherence (1-20, higher = stricter) |
| `params.num_images` | number | No | 1 | Number of images to generate (1-4) |
| `params.enable_safety_checker` | boolean | No | `true` | Filter NSFW content |
| `params.output_format` | string | No | `png` | Format: `png` or `jpeg` |
| `params.seed` | number | No | random | Seed for reproducibility |
| `waitForCompletion` | boolean | No | `true` | Wait for generation (sync mode) |
| `timeoutMs` | number | No | `120000` | Max wait time in milliseconds |

### Response (200 OK)
```json
{
  "success": true,
  "assetId": "clx123abc456def789",
  "imageUrl": "https://memecoin.blr1.digitaloceanspaces.com/generated/images/user123/1739012345_rocket_dog_logo.png",
  "creditsUsed": 2,
  "creditsRemaining": 98,
  "model": "fal-ai/flux-2/dev",
  "metadata": {
    "width": 1024,
    "height": 1024,
    "format": "png",
    "seed": 42,
    "prompt": "Cartoon dog mascot wearing sunglasses...",
    "num_inference_steps": 28,
    "guidance_scale": 3.5
  }
}
```

### Example 1: Fast Meme Coin Logo
```javascript
const response = await fetch('http://localhost:4000/generation/text-to-image', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer test-token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    modelName: 'fal-ai/nano-banana',
    params: {
      prompt: 'Cute shiba inu dog coin mascot, simple cartoon style, gold coins, moon background',
      image_size: 'square',
      num_inference_steps: 20
    }
  })
});
```

### Example 2: High Quality Landscape
```bash
curl -X POST http://localhost:4000/generation/text-to-image \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -d '{
    "modelName": "fal-ai/flux-2/dev",
    "params": {
      "prompt": "Epic mountain landscape at sunset, dramatic clouds, golden hour lighting, cinematic",
      "image_size": "landscape_16_9",
      "num_inference_steps": 30,
      "guidance_scale": 4.0,
      "output_format": "jpeg"
    },
    "waitForCompletion": true,
    "timeoutMs": 90000
  }'
```

### Example 3: Artistic Style with Recraft
```json
{
  "modelName": "fal-ai/recraft-v3",
  "params": {
    "prompt": "Abstract geometric crypto art, neon colors, futuristic vibe, digital illustration",
    "image_size": "portrait_4_3",
    "style": "digital_illustration",
    "num_inference_steps": 25,
    "guidance_scale": 5.0
  }
}
```

### Error Handling

**Insufficient Credits (400)**
```json
{
  "statusCode": 400,
  "message": "Insufficient credits. Required: 2, Available: 0",
  "error": "Bad Request"
}
```

**Invalid Parameters (400)**
```json
{
  "statusCode": 400,
  "message": [
    "params.prompt should not be empty",
    "params.image_size must be one of the following values: square_hd, square, portrait_4_3, portrait_16_9, landscape_4_3, landscape_16_9"
  ],
  "error": "Bad Request"
}
```

**Generation Timeout (408 - Credits Refunded)**
```json
{
  "success": false,
  "error": "Generation timed out after 120000ms",
  "creditsRefunded": 2,
  "creditsRemaining": 100
}
```

---

## 3. POST /generation/image-to-image

**Transform existing images** with AI-powered editing and style transfer.

### Endpoint
```
POST /generation/image-to-image
```

### Use Cases
- **Style Transfer**: Apply artistic styles to existing images
- **Image Enhancement**: Upscale, refine, or improve image quality
- **Content Modification**: Change colors, lighting, details while preserving structure
- **Batch Editing**: Apply consistent transformations to multiple images

### Supported Models

| Model | Credits | Speed | Quality | Best For |
|-------|---------|-------|---------|----------|
| `fal-ai/nano-banana/edit` | 1 | Fast | Good | Quick edits, iterations |
| `fal-ai/nano-banana-pro/edit` | 2 | Fast | Premium | Professional editing |
| `fal-ai/flux-2/edit` | 2 | Medium | High | Complex transformations |

### Request Body
```json
{
  "modelName": "fal-ai/flux-2/edit",
  "params": {
    "prompt": "Transform into watercolor painting style, soft colors, artistic",
    "image_urls": [
      "https://example.com/original-photo.jpg"
    ],
    "strength": 0.75,
    "guidance_scale": 4.0,
    "num_inference_steps": 28,
    "enable_safety_checker": true
  },
  "waitForCompletion": true,
  "timeoutMs": 120000
}
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `modelName` | string | Yes | - | Model to use (see table above) |
| `params.prompt` | string | Yes | - | Description of desired transformation |
| `params.image_urls` | string[] | **Yes** | - | URLs of images to transform |
| `params.strength` | number | No | 0.75 | Transformation intensity (0.0-1.0, higher = more changes) |
| `params.aspect_ratio` | string | No | original | Aspect ratio: `1:1`, `16:9`, `9:16`, `4:3`, `3:4` |
| `params.guidance_scale` | number | No | 3.5 | Prompt adherence (1-20) |
| `params.num_inference_steps` | number | No | 28 | Quality (4-50, higher = better) |
| `params.num_images` | number | No | 1 | Number of variations (1-4) |
| `params.enable_safety_checker` | boolean | No | `true` | Filter NSFW content |
| `params.output_format` | string | No | `png` | Format: `png` or `jpeg` |
| `params.seed` | number | No | random | Seed for reproducibility |
| `waitForCompletion` | boolean | No | `true` | Wait for generation (sync mode) |
| `timeoutMs` | number | No | `120000` | Max wait time in milliseconds |

### Response (200 OK)
```json
{
  "success": true,
  "assetId": "clx987xyz654abc123",
  "imageUrl": "https://memecoin.blr1.digitaloceanspaces.com/generated/images/user123/1739012456_watercolor_edit.png",
  "creditsUsed": 2,
  "creditsRemaining": 96,
  "model": "fal-ai/flux-2/edit",
  "metadata": {
    "width": 1024,
    "height": 768,
    "format": "png",
    "seed": 78901,
    "prompt": "Transform into watercolor painting style...",
    "strength": 0.75,
    "original_image": "https://example.com/original-photo.jpg"
  }
}
```

### Example 1: Watercolor Style Transfer
```javascript
const response = await fetch('http://localhost:4000/generation/image-to-image', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer test-token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    modelName: 'fal-ai/nano-banana/edit',
    params: {
      prompt: 'Watercolor painting style, soft pastel colors',
      image_urls: ['https://example.com/photo.jpg'],
      strength: 0.65,
      num_inference_steps: 20
    }
  })
});
```

### Example 2: Premium Quality Enhancement
```bash
curl -X POST http://localhost:4000/generation/image-to-image \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -d '{
    "modelName": "fal-ai/nano-banana-pro/edit",
    "params": {
      "prompt": "Professional photography, enhanced details, perfect lighting, 4K quality",
      "image_urls": ["https://example.com/product.jpg"],
      "strength": 0.45,
      "guidance_scale": 5.0,
      "num_inference_steps": 30,
      "output_format": "jpeg"
    },
    "waitForCompletion": true,
    "timeoutMs": 90000
  }'
```

### Example 3: Advanced Transformation
```json
{
  "modelName": "fal-ai/flux-2/edit",
  "params": {
    "prompt": "Cyberpunk neon aesthetic, purple and blue tones, futuristic city background",
    "image_urls": ["https://example.com/portrait.jpg"],
    "strength": 0.8,
    "aspect_ratio": "16:9",
    "guidance_scale": 6.0,
    "num_inference_steps": 35,
    "num_images": 2
  }
}
```

### Example 4: Subtle Color Correction
```json
{
  "modelName": "fal-ai/nano-banana/edit",
  "params": {
    "prompt": "Warm sunset lighting, golden hour, enhanced vibrance",
    "image_urls": ["https://example.com/landscape.jpg"],
    "strength": 0.3,
    "num_inference_steps": 15
  }
}
```

### Error Handling

**Missing Required Field (400)**
```json
{
  "statusCode": 400,
  "message": [
    "params.image_urls should not be empty",
    "params.image_urls must be an array"
  ],
  "error": "Bad Request"
}
```

**Invalid Strength Value (400)**
```json
{
  "statusCode": 400,
  "message": [
    "params.strength must not be greater than 1",
    "params.strength must not be less than 0"
  ],
  "error": "Bad Request"
}
```

**Generation Failed (500 - Credits Refunded)**
```json
{
  "success": false,
  "error": "Image transformation failed: Invalid image URL",
  "creditsRefunded": 2,
  "creditsRemaining": 98
}
```

---

## 4. POST /generation/remove-background

**Remove background from images** using AI-powered segmentation.

### Endpoint
```
POST /generation/remove-background
```

### Use Cases
- **Product Photography**: Remove distracting backgrounds from products
- **Profile Pictures**: Clean isolated portraits with transparent backgrounds
- **Graphic Design**: Extract subjects for compositing
- **E-commerce**: Professional-looking product images

### Request Body
```json
{
  "image_url": "https://example.com/product-photo.jpg",
  "sync_mode": true,
  "crop_to_bbox": false,
  "waitForCompletion": true,
  "timeoutMs": 60000
}
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `image_url` | string | Yes | - | URL of image to process |
| `sync_mode` | boolean | No | `true` | Return result immediately (true) or as URL (false) |
| `crop_to_bbox` | boolean | No | `false` | Crop image to foreground bounding box |
| `waitForCompletion` | boolean | No | `true` | Wait for processing to complete |
| `timeoutMs` | number | No | `60000` | Max wait time (60s default) |

### Response (200 OK)
```json
{
  "success": true,
  "assetId": "clx445566778899aabb",
  "imageUrl": "https://memecoin.blr1.digitaloceanspaces.com/generated/images/user123/1739654321_no_bg.png",
  "creditsUsed": 2,
  "creditsRemaining": 96,
  "metadata": {
    "width": 1024,
    "height": 1024,
    "format": "png",
    "hasTransparency": true
  }
}
```

### Example Use Case: E-commerce Product Image

```bash
# Remove background from product photo
curl -X POST http://localhost:4000/generation/remove-background \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://example.com/uploads/product-on-messy-desk.jpg",
    "sync_mode": true,
    "crop_to_bbox": true
  }'

# Result: Clean product image with transparent background, cropped to object
```

### Cost
- **2 credits** per background removal
- Credits refunded on failure

---

## 5. GET /generation/credits

**Get user's credit balance** and usage statistics.

### Endpoint
```
GET /generation/credits
```

### Use Cases
- **Display Balance**: Show remaining credits in UI
- **Pre-flight Check**: Verify sufficient credits before generation
- **Usage Tracking**: Monitor credit consumption
- **Billing Integration**: Track usage for invoicing

### Response (200 OK)
```json
{
  "userId": "test-user-12345",
  "balance": 98,
  "totalUsed": 12,
  "totalEarned": 110,
  "lastUpdated": "2026-02-18T11:45:23.000Z"
}
```

### Example Use Case: UI Credit Display

```javascript
async function displayCredits() {
  const response = await fetch('http://localhost:4000/generation/credits', {
    headers: { 'Authorization': 'Bearer test-token' }
  });
  const data = await response.json();
  
  document.getElementById('credits-balance').textContent = data.balance;
  
  // Show warning if low
  if (data.balance < 10) {
    showLowCreditsWarning();
  }
}
```

---

## 6. GET /generation/status/:falRequestId

**Check generation status** using Fal AI request ID.

### Endpoint
```
GET /generation/status/:falRequestId
```

### Use Cases
- **Polling**: Check if async generation is complete
- **Progress Updates**: Show generation status to users
- **Error Detection**: Identify failed generations
- **Webhook Alternative**: Manual status checking without webhooks

### Response (200 OK)

**Processing:**
```json
{
  "assetId": "clx123456789abcdef",
  "status": "PROCESSING",
  "falRequestId": "fal-abc123xyz",
  "progress": 65,
  "estimatedTimeRemaining": 15000
}
```

**Completed:**
```json
{
  "assetId": "clx123456789abcdef",
  "status": "COMPLETED",
  "imageUrl": "https://memecoin.blr1.digitaloceanspaces.com/generated/images/user123/image.png",
  "falRequestId": "fal-abc123xyz",
  "completedAt": "2026-02-18T11:50:00.000Z"
}
```

**Failed:**
```json
{
  "assetId": "clx123456789abcdef",
  "status": "FAILED",
  "error": "Model timeout",
  "falRequestId": "fal-abc123xyz",
  "failedAt": "2026-02-18T11:50:00.000Z"
}
```

### Example Use Case: Polling Loop

```javascript
async function waitForGeneration(falRequestId) {
  const maxAttempts = 60; // 60 attempts = 60 seconds
  
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(
      `http://localhost:4000/generation/status/${falRequestId}`,
      { headers: { 'Authorization': 'Bearer test-token' } }
    );
    const status = await response.json();
    
    if (status.status === 'COMPLETED') {
      console.log('Generation complete!', status.imageUrl);
      return status;
    }
    
    if (status.status === 'FAILED') {
      throw new Error(`Generation failed: ${status.error}`);
    }
    
    // Wait 1 second before next poll
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error('Generation timeout');
}
```

---

## 7. GET /generation/user/generations

**Get paginated list** of user's generations.

### Endpoint
```
GET /generation/user/generations?page=1&limit=10
```

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | `1` | Page number (1-indexed) |
| `limit` | number | No | `10` | Items per page (max 100) |

### Use Cases
- **Gallery View**: Display user's generated images
- **History**: Show generation history
- **Portfolio**: User's AI art collection
- **Infinite Scroll**: Load more images on scroll

### Response (200 OK)
```json
{
  "data": [
    {
      "id": "clx123456789abcdef",
      "imageUrl": "https://memecoin.blr1.digitaloceanspaces.com/generated/images/user123/image1.png",
      "prompt": "A futuristic city at sunset",
      "model": "fal-ai/flux-2/dev",
      "status": "COMPLETED",
      "creditsUsed": 2,
      "createdAt": "2026-02-18T11:45:00.000Z"
    },
    {
      "id": "clx987654321fedcba",
      "imageUrl": "https://memecoin.blr1.digitaloceanspaces.com/generated/images/user123/image2.png",
      "prompt": "Abstract geometric art",
      "model": "fal-ai/nano-banana",
      "status": "COMPLETED",
      "creditsUsed": 1,
      "createdAt": "2026-02-18T11:40:00.000Z"
    }
  ],
  "pagination": {
    "total": 45,
    "page": 1,
    "limit": 10,
    "totalPages": 5,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### Example Use Case: Image Gallery

```javascript
async function loadGallery(page = 1) {
  const response = await fetch(
    `http://localhost:4000/generation/user/generations?page=${page}&limit=20`,
    { headers: { 'Authorization': 'Bearer test-token' } }
  );
  const { data, pagination } = await response.json();
  
  // Render images in gallery
  data.forEach(gen => {
    const img = document.createElement('img');
    img.src = gen.imageUrl;
    img.alt = gen.prompt;
    document.getElementById('gallery').appendChild(img);
  });
  
  // Show "Load More" button if more pages exist
  if (pagination.hasNext) {
    showLoadMoreButton(() => loadGallery(page + 1));
  }
}
```

---

## 8. GET /generation/results

**Get filtered generations** with status filter support.

### Endpoint
```
GET /generation/results?status=COMPLETED&page=1&limit=10
```

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `status` | enum | No | - | Filter by status: `PROCESSING`, `COMPLETED`, `FAILED` |
| `page` | number | No | `1` | Page number |
| `limit` | number | No | `10` | Items per page |

### Use Cases
- **Filter Failed**: Show only failed generations for retry
- **Show Processing**: Display in-progress generations
- **Completed Only**: Gallery of finished images
- **Error Dashboard**: Monitor and debug failures

### Response (200 OK)
```json
{
  "data": [
    {
      "id": "clx123456789abcdef",
      "imageUrl": "https://memecoin.blr1.digitaloceanspaces.com/generated/images/user123/image.png",
      "status": "COMPLETED",
      "model": "fal-ai/flux-2/dev",
      "prompt": "A serene landscape",
      "creditsUsed": 2,
      "createdAt": "2026-02-18T11:45:00.000Z",
      "completedAt": "2026-02-18T11:46:30.000Z"
    }
  ],
  "pagination": {
    "total": 12,
    "page": 1,
    "limit": 10,
    "totalPages": 2,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### Example Use Case: Failed Generation Dashboard

```bash
# Get all failed generations
curl "http://localhost:4000/generation/results?status=FAILED" \
  -H "Authorization: Bearer test-token"

# Retry failed generations
# (Logic to retry each failed generation)
```

---

## 9. GET /generation/:id

**Get specific generation** by asset ID.

### Endpoint
```
GET /generation/:id
```

### Use Cases
- **Detail View**: Show full details of a generation
- **Share Link**: Direct link to specific generation
- **Download**: Get image URL for downloading
- **Metadata**: Access generation parameters and metadata

### Response (200 OK)
```json
{
  "id": "clx123456789abcdef",
  "userId": "test-user-12345",
  "imageUrl": "https://memecoin.blr1.digitaloceanspaces.com/generated/images/user123/sunset_city.png",
  "status": "COMPLETED",
  "model": "fal-ai/flux-2/dev",
  "prompt": "A futuristic city at sunset with flying cars",
  "parameters": {
    "image_size": "landscape_16_9",
    "num_inference_steps": 28,
    "guidance_scale": 3.5,
    "seed": 42
  },
  "creditsUsed": 2,
  "falRequestId": "fal-abc123xyz",
  "metadata": {
    "width": 1920,
    "height": 1080,
    "format": "png",
    "fileSize": 2456789
  },
  "createdAt": "2026-02-18T11:45:00.000Z",
  "completedAt": "2026-02-18T11:46:30.000Z"
}
```

### Example Use Case: Generation Detail Page

```javascript
async function showGenerationDetail(assetId) {
  const response = await fetch(
    `http://localhost:4000/generation/${assetId}`,
    { headers: { 'Authorization': 'Bearer test-token' } }
  );
  const gen = await response.json();
  
  // Display image
  document.getElementById('image').src = gen.imageUrl;
  
  // Show metadata
  document.getElementById('prompt').textContent = gen.prompt;
  document.getElementById('model').textContent = gen.model;
  document.getElementById('credits').textContent = gen.creditsUsed;
  document.getElementById('dimensions').textContent = 
    `${gen.metadata.width}×${gen.metadata.height}`;
  
  // Download button
  document.getElementById('download').href = gen.imageUrl;
  document.getElementById('download').download = 'generated-image.png';
}
```

---

## 10. DELETE /generation/:generationId

**Delete a single generation** and its associated image.

### Endpoint
```
DELETE /generation/:generationId
```

### Use Cases
- **Cleanup**: Remove unwanted generations
- **Privacy**: Delete sensitive images
- **Storage Management**: Free up S3 storage space
- **UI Actions**: "Delete" button in gallery

### Response (200 OK)
```json
{
  "success": true,
  "message": "Generation deleted successfully",
  "deletedId": "clx123456789abcdef",
  "s3FileDeleted": true
}
```

### Example Use Case: Gallery Delete Button

```javascript
async function deleteGeneration(generationId) {
  if (!confirm('Delete this generation?')) return;
  
  const response = await fetch(
    `http://localhost:4000/generation/${generationId}`,
    {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer test-token' }
    }
  );
  
  if (response.ok) {
    // Remove from UI
    document.getElementById(`gen-${generationId}`).remove();
    showToast('Generation deleted');
  }
}
```

---

## 11. POST /generation/bulk-delete

**Delete multiple generations** at once.

### Endpoint
```
POST /generation/bulk-delete
```

### Use Cases
- **Bulk Cleanup**: Delete many generations at once
- **Select & Delete**: Multi-select deletion in gallery
- **Batch Operations**: Efficient cleanup of old content
- **Admin Tools**: Moderate user content

### Request Body
```json
{
  "ids": [
    "clx123456789abcdef",
    "clx987654321fedcba",
    "clx456789123defabc"
  ]
}
```

### Response (200 OK)
```json
{
  "success": true,
  "deleted": 3,
  "failed": 0,
  "results": [
    {
      "id": "clx123456789abcdef",
      "success": true,
      "s3Deleted": true
    },
    {
      "id": "clx987654321fedcba",
      "success": true,
      "s3Deleted": true
    },
    {
      "id": "clx456789123defabc",
      "success": true,
      "s3Deleted": true
    }
  ]
}
```

### Example Use Case: Multi-Select Delete

```javascript
async function bulkDeleteSelected() {
  const selected = Array.from(document.querySelectorAll('.gallery-item.selected'))
    .map(el => el.dataset.id);
  
  if (selected.length === 0) {
    alert('No items selected');
    return;
  }
  
  if (!confirm(`Delete ${selected.length} generations?`)) return;
  
  const response = await fetch('http://localhost:4000/generation/bulk-delete', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer test-token',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ids: selected })
  });
  
  const result = await response.json();
  
  if (result.success) {
    // Remove deleted items from UI
    selected.forEach(id => {
      document.getElementById(`gen-${id}`)?.remove();
    });
    showToast(`${result.deleted} generations deleted`);
  }
}
```

---

## 12. GET /generation/config/status

**Check module configuration** and system status.

### Endpoint
```
GET /generation/config/status
```

### Use Cases
- **Health Check**: Verify system is properly configured
- **Diagnostics**: Debug configuration issues
- **Monitoring**: Track system health
- **Admin Dashboard**: Show system status

### Response (200 OK)

**Healthy Configuration:**
```json
{
  "status": "ready",
  "s3Configured": true,
  "availableProviders": ["fal-ai"],
  "errors": [],
  "warnings": []
}
```

**Configuration Issues:**
```json
{
  "status": "incomplete",
  "s3Configured": false,
  "availableProviders": [],
  "errors": [
    "DO_SPACES_KEY not configured",
    "DO_SPACES_SECRET not configured"
  ],
  "warnings": [
    "FAL_KEY not set, FAL models unavailable"
  ]
}
```

### Example Use Case: Admin Health Check

```javascript
async function checkSystemHealth() {
  const response = await fetch('http://localhost:4000/generation/config/status');
  const status = await response.json();
  
  if (status.status === 'ready') {
    console.log('✅ System ready');
    console.log('Available providers:', status.availableProviders);
  } else {
    console.error('❌ Configuration issues:');
    status.errors.forEach(err => console.error(`  - ${err}`));
    status.warnings.forEach(warn => console.warn(`  ⚠️ ${warn}`));
  }
}
```

---

## 13. POST /generation/webhook/result

**Webhook endpoint** for Fal AI callbacks (internal use).

### Endpoint
```
POST /generation/webhook/result
```

### Use Cases
- **Async Completion**: Fal AI notifies when generation completes
- **Auto-Update**: Automatic status updates without polling
- **Scalability**: Handle high-volume async generations
- **Integration**: Connect with Fal AI's webhook system

### Request Body (Fal AI sends)
```json
{
  "request_id": "fal-abc123xyz",
  "status": "completed",
  "output": {
    "images": [
      {
        "url": "https://fal.media/files/image.png"
      }
    ]
  }
}
```

### Response (200 OK)
```json
{
  "success": true
}
```

### Configuration
Set webhook URL in Fal AI dashboard:
```
https://your-domain.com/generation/webhook/result
```

---

## 14. POST /brand/retrieve

**Retrieve comprehensive brand data** for any domain using Brand.dev API.

### Endpoint
```
POST /brand/retrieve
```

### Use Cases
- **Meme Coin Branding**: Get logos, colors, and fonts for crypto projects
- **Marketing Campaigns**: Extract brand assets for promotional materials
- **Design Consistency**: Ensure brand compliance in generated content
- **Automated Branding**: Bulk retrieval of brand data for multiple domains

### Features
- **Caching**: Results cached for 1 hour (configurable)
- **Rich Data**: Logos, colors, fonts, and brand descriptions
- **Format Detection**: SVG, PNG, WEBP, JPEG support
- **Multiple Variants**: Primary, secondary, favicon logos

### Request Body
```json
{
  "domain": "uniswap.org",
  "maxSpeed": false,
  "force_language": "english",
  "timeoutMS": 30000
}
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `domain` | string | **Yes** | - | Domain to fetch brand data from |
| `maxSpeed` | boolean | No | `false` | Optimize for speed, skip time-consuming operations |
| `force_language` | string | No | - | Language: `english`, `spanish`, `french`, `german`, `italian`, `portuguese`, `russian`, `chinese`, `japanese`, `korean` |
| `timeoutMS` | number | No | - | Request timeout in milliseconds (max 300000ms / 5 minutes) |
| `forceRefresh` | boolean | No | `false` | Bypass cache and fetch fresh data |

### Response (200 OK)
```json
{
  "success": true,
  "brand": {
    "domain": "uniswap.org",
    "name": "Uniswap",
    "description": "A leading decentralized exchange protocol",
    "colors": [
      {
        "hex": "#FF007A",
        "name": "Pink",
        "type": "primary"
      },
      {
        "hex": "#FFFFFF",
        "name": "White",
        "type": "secondary"
      }
    ],
    "logos": [
      {
        "url": "https://uniswap.org/logo.svg",
        "type": "primary",
        "format": "svg"
      },
      {
        "url": "https://uniswap.org/favicon.ico",
        "type": "favicon",
        "format": "ico"
      }
    ],
    "fonts": [
      {
        "name": "Inter",
        "weight": "400"
      },
      {
        "name": "Inter",
        "weight": "700"
      }
    ]
  },
  "colors": ["#FF007A", "#FFFFFF", "#131313"],
  "logos": ["https://uniswap.org/logo.svg"],
  "description": "A leading decentralized exchange protocol",
  "cached": false,
  "timestamp": "2026-02-19T10:30:00Z"
}
```

### Example 1: Basic Brand Retrieval
```javascript
const response = await fetch('http://localhost:4000/brand/retrieve', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer test-token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    domain: 'stripe.com'
  })
});

const brandData = await response.json();
console.log('Primary Color:', brandData.colors[0]);
console.log('Logo URL:', brandData.logos[0]);
```

### Example 2: Fast Retrieval with Language
```bash
curl -X POST http://localhost:4000/brand/retrieve \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "nike.com",
    "maxSpeed": true,
    "force_language": "english"
  }'
```

### Example 3: Force Cache Refresh
```json
{
  "domain": "apple.com",
  "forceRefresh": true
}
```

### Error Handling

**API Key Not Configured (503)**
```json
{
  "success": false,
  "error": "BRAND_DEV_API_KEY not configured"
}
```

**Invalid Domain (400)**
```json
{
  "statusCode": 400,
  "message": ["domain should not be empty"],
  "error": "Bad Request"
}
```

**Brand.dev API Error (500)**
```json
{
  "success": false,
  "error": "Failed to retrieve brand data: API timeout"
}
```

---

## 15. POST /brand/ai-query

**Extract custom data** from any company website using AI-powered scraping.

### Endpoint
```
POST /brand/ai-query
```

### Use Cases
- **Pricing Analysis**: Extract pricing tiers and plans
- **Feature Detection**: Get product features and capabilities
- **Team Information**: Scrape team size and employee data
- **Custom Extraction**: Define any data points to extract
- **Competitive Research**: Bulk data collection from competitor sites

### Features
- **Natural Language**: Define data points in plain English
- **Structured Extraction**: Returns JSON with typed data
- **Multi-page Analysis**: Scan specific pages (pricing, about, careers, etc.)
- **Type Safety**: Support for text, number, date, boolean, list, URL types
- **Complex Objects**: Extract nested data structures

### Request Body
```json
{
  "domain": "stripe.com",
  "data_to_extract": [
    {
      "datapoint_name": "pricing_tier",
      "datapoint_description": "The starting price for the basic plan",
      "datapoint_example": "$9.99/month",
      "datapoint_type": "text"
    },
    {
      "datapoint_name": "features",
      "datapoint_description": "List of key product features",
      "datapoint_example": ["Real-time collaboration", "Unlimited projects"],
      "datapoint_type": "list",
      "datapoint_list_type": "string"
    },
    {
      "datapoint_name": "team_size",
      "datapoint_description": "Approximate number of employees",
      "datapoint_example": "50-100 employees",
      "datapoint_type": "text"
    }
  ],
  "specific_pages": {
    "home_page": true,
    "pricing": true,
    "about_us": true,
    "careers": false
  }
}
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `domain` | string | **Yes** | - | Domain to analyze |
| `data_to_extract` | array | **Yes** | - | Array of data points to extract |
| `specific_pages` | object | No | `{home_page: true}` | Pages to analyze |
| `maxSpeed` | boolean | No | `false` | Optimize for speed |
| `force_language` | string | No | - | Force language for extraction |
| `timeoutMS` | number | No | - | Request timeout (max 300000ms) |

### Data Point Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `datapoint_name` | string | **Yes** | Unique identifier for the data point |
| `datapoint_description` | string | **Yes** | What to extract |
| `datapoint_example` | string | **Yes** | Example value (helps AI understand) |
| `datapoint_type` | string | No | Type: `text`, `number`, `date`, `boolean`, `list`, `url` (default: `text`) |
| `datapoint_list_type` | string | No | When type is `list`, specify item type |
| `datapoint_object_schema` | object | No | When list items are objects, define schema |

### Available Pages

- `home_page` (default: `true`)
- `pricing`
- `about_us`
- `blog`
- `careers`
- `contact_us`
- `faq`
- `privacy_policy`
- `terms_and_conditions`

### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "pricing_tier": "$29/month",
    "features": [
      "Payment processing",
      "Fraud detection",
      "Global payments",
      "Developer APIs",
      "24/7 support"
    ],
    "team_size": "7,000+ employees"
  },
  "timestamp": "2026-02-19T10:35:00Z"
}
```

### Example 1: Extract Pricing Information
```javascript
const response = await fetch('http://localhost:4000/brand/ai-query', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer test-token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    domain: 'notion.so',
    data_to_extract: [
      {
        datapoint_name: 'free_plan',
        datapoint_description: 'Is there a free plan available?',
        datapoint_example: 'yes',
        datapoint_type: 'boolean'
      },
      {
        datapoint_name: 'starting_price',
        datapoint_description: 'Starting price for paid plans',
        datapoint_example: '$8/month',
        datapoint_type: 'text'
      }
    ],
    specific_pages: {
      pricing: true
    }
  })
});
```

### Example 2: Extract Team and Company Info
```bash
curl -X POST http://localhost:4000/brand/ai-query \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "openai.com",
    "data_to_extract": [
      {
        "datapoint_name": "founded_year",
        "datapoint_description": "Year the company was founded",
        "datapoint_example": "2015",
        "datapoint_type": "number"
      },
      {
        "datapoint_name": "mission",
        "datapoint_description": "Company mission statement",
        "datapoint_example": "To ensure artificial general intelligence benefits all of humanity",
        "datapoint_type": "text"
      }
    ],
    "specific_pages": {
      "home_page": true,
      "about_us": true
    }
  }'
```

### Example 3: Extract Complex Product Data
```json
{
  "domain": "github.com",
  "data_to_extract": [
    {
      "datapoint_name": "plan_names",
      "datapoint_description": "Names of all pricing plans",
      "datapoint_example": ["Free", "Team", "Enterprise"],
      "datapoint_type": "list",
      "datapoint_list_type": "string"
    },
    {
      "datapoint_name": "security_features",
      "datapoint_description": "List of security features",
      "datapoint_example": ["2FA", "SAML SSO", "Dependency scanning"],
      "datapoint_type": "list",
      "datapoint_list_type": "string"
    }
  ],
  "specific_pages": {
    "pricing": true,
    "home_page": true
  }
}
```

### Error Handling

**API Key Not Configured (503)**
```json
{
  "statusCode": 503,
  "message": "BRAND_DEV_API_KEY not configured",
  "error": "Service Unavailable"
}
```

**Invalid Data Point (400)**
```json
{
  "statusCode": 400,
  "message": [
    "data_to_extract[0].datapoint_example should not be empty"
  ],
  "error": "Bad Request"
}
```

---

## 16. GET /brand/health

**Check brand service health** and API configuration status.

### Endpoint
```
GET /brand/health
```

### Response (200 OK)
```json
{
  "configured": true,
  "apiKeyPresent": true,
  "cacheStats": {
    "totalEntries": 5,
    "validEntries": 5,
    "expiredEntries": 0,
    "cacheTTL": 3600,
    "domains": ["uniswap.org", "stripe.com", "nike.com"]
  }
}
```

### Example
```bash
curl http://localhost:4000/brand/health \
  -H "Authorization: Bearer test-token"
```

---

## 17. GET /brand/cache/stats

**Get detailed cache statistics** for the brand service.

### Endpoint
```
GET /brand/cache/stats
```

### Response (200 OK)
```json
{
  "totalEntries": 5,
  "validEntries": 5,
  "expiredEntries": 0,
  "cacheTTL": 3600,
  "domains": ["uniswap.org", "stripe.com", "nike.com", "apple.com", "google.com"]
}
```

### Example
```javascript
const stats = await fetch('http://localhost:4000/brand/cache/stats', {
  headers: { 'Authorization': 'Bearer test-token' }
}).then(r => r.json());

console.log(`Cached domains: ${stats.domains.length}`);
console.log(`Cache TTL: ${stats.cacheTTL}s`);
```

---

## 18. DELETE /brand/cache

**Clear brand cache** for a specific domain or all domains.

### Endpoint
```
DELETE /brand/cache?domain={domain}
```

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `domain` | string | No | Specific domain to clear. If omitted, clears all cache |

### Response (200 OK)

**Clear Specific Domain**
```json
{
  "cleared": 1,
  "domain": "uniswap.org",
  "message": "Cache cleared for uniswap.org"
}
```

**Clear All Cache**
```json
{
  "cleared": 5,
  "message": "All cache cleared"
}
```

### Examples

**Clear Specific Domain**
```bash
curl -X DELETE "http://localhost:4000/brand/cache?domain=uniswap.org" \
  -H "Authorization: Bearer test-token"
```

**Clear All Cache**
```javascript
const result = await fetch('http://localhost:4000/brand/cache', {
  method: 'DELETE',
  headers: { 'Authorization': 'Bearer test-token' }
}).then(r => r.json());

console.log(`Cleared ${result.cleared} cache entries`);
```

---

## Common Patterns

### 1. Check Credits Before Generation
```javascript
async function safeGenerate(params) {
  // Check credits
  const credits = await fetch('http://localhost:4000/generation/credits', {
    headers: { 'Authorization': 'Bearer test-token' }
  }).then(r => r.json());
  
  if (credits.balance < 2) {
    alert('Insufficient credits');
    return;
  }
  
  // Generate
  return fetch('http://localhost:4000/generation/generate/sync', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer test-token',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  });
}
```

### 2. Async Generation with Polling
```javascript
async function asyncGenerateWithPolling(params) {
  // Start generation
  const startResponse = await fetch('http://localhost:4000/generation/generate', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer test-token',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  });
  const { falRequestId } = await startResponse.json();
  
  // Poll for completion
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
    
    const statusResponse = await fetch(
      `http://localhost:4000/generation/status/${falRequestId}`,
      { headers: { 'Authorization': 'Bearer test-token' } }
    );
    const status = await statusResponse.json();
    
    if (status.status === 'COMPLETED') {
      return status;
    }
    if (status.status === 'FAILED') {
      throw new Error(status.error);
    }
  }
}
```

### 3. Paginated Gallery with Filter
```javascript
async function loadFilteredGallery(status = null, page = 1) {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: '20'
  });
  if (status) params.append('status', status);
  
  const response = await fetch(
    `http://localhost:4000/generation/results?${params}`,
    { headers: { 'Authorization': 'Bearer test-token' } }
  );
  return response.json();
}
```

### 4. Error Handling with Credit Refund
```javascript
async function generateWithRefund(params) {
  try {
    const response = await fetch('http://localhost:4000/generation/generate/sync', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });
    
    if (!response.ok) {
      const error = await response.json();
      
      // Credits automatically refunded on failure
      if (error.creditsRefunded) {
        console.log(`Credits refunded: ${error.creditsRefunded}`);
      }
      
      throw new Error(error.message || 'Generation failed');
    }
    
    return response.json();
  } catch (error) {
    console.error('Generation error:', error);
    throw error;
  }
}
```

---

## Status Codes

| Code | Status | Description |
|------|--------|-------------|
| 200 | OK | Request successful |
| 202 | Accepted | Async generation started |
| 400 | Bad Request | Invalid parameters or insufficient credits |
| 401 | Unauthorized | Missing or invalid token |
| 404 | Not Found | Generation not found |
| 408 | Request Timeout | Generation timed out |
| 500 | Internal Server Error | Server error (credits refunded) |

---

## Rate Limiting

All endpoints are subject to rate limiting:
- **Per User**: 100 requests per minute
- **Burst**: 10 requests per second
- **Headers**: Rate limit info in response headers

---

## Best Practices

1. **Always check credits** before expensive operations
2. **Use sync endpoint** for interactive workflows
3. **Use async endpoint** for batch processing
4. **Implement retry logic** for failed generations
5. **Clean up old generations** to manage storage
6. **Monitor credit usage** to avoid surprises
7. **Handle timeouts gracefully** with appropriate UI feedback
8. **Cache generation results** to avoid regenerating same prompt

---

## Testing

Use the test token for all development:
```bash
export TOKEN="test-token"

# Test generation
curl -X POST http://localhost:4000/generation/generate/sync \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"modelName":"fal-ai/nano-banana","params":{"prompt":"test"}}'
```

---

## Support

For issues or questions:
- Check [Generation README](./README.md) for module overview
- See [Background Removal Docs](./README-background-removal.md) for detailed bg removal guide
- Review test files in `background-removal-tests.http`

---

**Last Updated**: February 19, 2026
