# Generation Module

Comprehensive AI-powered content generation module supporting text and image generation using multiple AI providers with **seamless DigitalOcean Spaces integration**.

## Features

- **Multi-Provider Support**: OpenAI, Google Gemini, OpenRouter
- **Image Generation**: DALL-E 3, various sizes and qualities
- **Text Generation**: GPT-4, Gemini Pro with customizable parameters
- **Combined Content**: Generate text + images in one request
- **🎯 Automatic S3 Integration**: Auto-upload all generated images to DigitalOcean Spaces
- **Smart File Organization**: Organized folder structure by user and timestamp
- **Public/Private Storage**: Choose between public URLs or presigned access
- **Rate Limiting**: Built-in throttling protection
- **Type Safety**: Full TypeScript support with validation

## S3 Integration (DigitalOcean Spaces)

All generated images are automatically uploaded to your DigitalOcean Spaces bucket with:

### File Organization
```
your-bucket/
└── generated/
    └── images/
        └── {userId}/
            └── {timestamp}_{sanitized_prompt}.png
```

### Key Features
- ✅ **Automatic Upload**: Every generated image is uploaded to S3
- ✅ **Smart Naming**: Files named with timestamp + sanitized prompt
- ✅ **User Isolation**: Each user gets their own folder
- ✅ **Public URLs**: Direct access URLs for easy sharing
- ✅ **Metadata Tracking**: Original URLs and generation details stored
- ✅ **Error Recovery**: Robust retry logic for failed uploads

### Storage Options

**Public Images (Default)**
```json
{
  "prompt": "A logo...",
  "isPublic": true
}
```
Returns direct public URL: `https://bucket.region.digitaloceanspaces.com/generated/images/...`

**Private Images** (with presigned URLs)
```json
{
  "prompt": "A logo...",
  "isPublic": false
}
```
Returns presigned URL valid for 3 hours

## Configuration

Add these environment variables to your `.env`:

```bash
# Required for Image Generation
OPENAI_API_KEY=sk-...

# Required for DigitalOcean Spaces (Already Configured)
DO_SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
DO_SPACES_REGION=nyc3
DO_SPACES_KEY=your-spaces-key
DO_SPACES_SECRET=your-spaces-secret
DO_SPACES_BUCKET=your-bucket-name

# Optional AI Providers
GOOGLE_AI_API_KEY=...
OPENROUTER_API_KEY=...
```

## API Endpoints

### 1. Generate Image

**POST** `/generation/image`

Generate images using AI models.

```json
{
  "prompt": "A futuristic meme coin logo with vibrant colors",
  "provider": "openai",
  "size": "1024x1024",
  "quality": "hd",
  "n": 1
}
```

**Response:**
```json
{
  "imageUrl": "https://bucket.nyc3.digitaloceanspaces.com/generated/images/user123/1234567890.png",
  "imageKey": "generated/images/user123/1234567890.png",
  "prompt": "A futuristic meme coin logo...",
  "provider": "openai",
  "size": "1024x1024",
  "quality": "hd",
  "timestamp": "2026-02-13T10:30:00.000Z",
  "metadata": {
    "model": "dall-e-3",
    "revisedPrompt": "Enhanced prompt..."
  }
}
```

### 2. Generate Text

**POST** `/generation/text`

Generate text content using AI models.

```json
{
  "prompt": "Write a compelling description for a meme coin",
  "provider": "openai",
  "maxTokens": 1000,
  "temperature": 0.7,
  "systemMessage": "You are a creative marketing copywriter"
}
```

**Response:**
```json
{
  "content": "Generated text content here...",
  "prompt": "Write a compelling description...",
  "provider": "openai",
  "tokensUsed": 245,
  "timestamp": "2026-02-13T10:30:00.000Z",
  "metadata": {
    "model": "gpt-4-turbo-preview",
    "finishReason": "stop"
  }
}
```

### 3. Generate Content

**POST** `/generation/content`

Generate comprehensive content with text and images.

```json
{
  "prompt": "Create marketing content for a new meme coin launch",
  "generateImages": true,
  "imageCount": 2,
  "imagePrompt": "Meme coin logo and banner",
  "textProvider": "openai",
  "imageProvider": "openai",
  "maxTokens": 1500,
  "temperature": 0.7,
  "imageSize": "1024x1024",
  "imageQuality": "hd"
}
```

**Response:**
```json
{
  "text": {
    "content": "Marketing copy...",
    "prompt": "Create marketing content...",
    "provider": "openai",
    "tokensUsed": 450,
    "timestamp": "2026-02-13T10:30:00.000Z"
  },
  "images": [
    {
      "imageUrl": "https://...",
      "imageKey": "generated/images/...",
      "prompt": "Meme coin logo and banner",
      "provider": "openai",
      "size": "1024x1024",
      "quality": "hd",
      "timestamp": "2026-02-13T10:30:00.000Z"
    }
  ],
  "metadata": {
    "userId": "user123",
    "timestamp": "2026-02-13T10:30:00.000Z",
    "totalImages": 2
  }
}
```

### 4. Get Job Status

**GET** `/generation/status/:jobId`

Check the status of a generation job (for future queue implementation).

## Configuration

Add these environment variables to your `.env`:

```bash
# OpenAI (required for image generation)
OPENAI_API_KEY=sk-...

# Google AI (optional)
GOOGLE_AI_API_KEY=...

# OpenRouter (optional)
OPENROUTER_API_KEY=...

# Already configured
DO_SPACES_ENDPOINT=...
DO_SPACES_REGION=...
DO_SPACES_KEY=...
DO_SPACES_SECRET=...
DO_SPACES_BUCKET=...
```

## Providers

### OpenAI
- **Text Models**: GPT-4 Turbo, GPT-3.5 Turbo
- **Image Models**: DALL-E 3
- **Sizes**: 256x256, 512x512, 1024x1024, 1792x1024, 1024x1792
- **Quality**: standard, hd

### Google Gemini
- **Text Models**: Gemini Pro
- **Image Models**: Coming soon (Imagen)

### OpenRouter
- **Text Models**: Various (implementation pending)
- **Image Models**: Coming soon

## Rate Limits

- **Production**: 30 requests per minute
- **Development**: 100 requests per minute

## Usage Examples

### TypeScript Client

```typescript
import axios from 'axios';

// Generate an image
const imageResult = await axios.post('http://localhost:3000/generation/image', {
  prompt: 'A golden retriever wearing sunglasses',
  size: '1024x1024',
  quality: 'hd'
});

console.log('Image URL:', imageResult.data.imageUrl);

// Generate text
const textResult = await axios.post('http://localhost:3000/generation/text', {
  prompt: 'Write a tagline for a tech startup',
  maxTokens: 100,
  temperature: 0.9
});

console.log('Generated text:', textResult.data.content);

// Generate complete content
const contentResult = await axios.post('http://localhost:3000/generation/content', {
  prompt: 'Create a social media post about AI',
  generateImages: true,
  imageCount: 1,
  maxTokens: 500
});

console.log('Text:', contentResult.data.text.content);
console.log('Images:', contentResult.data.images.map(img => img.imageUrl));
```

### cURL

```bash
# Generate image
curl -X POST http://localhost:3000/generation/image \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cute robot",
    "size": "1024x1024"
  }'

# Generate text
curl -X POST http://localhost:3000/generation/text \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain blockchain in simple terms",
    "maxTokens": 200
  }'
```

## Architecture

```
generation/
├── generation.module.ts          # Module definition
├── generation.controller.ts      # HTTP endpoints
├── generation.service.ts         # Business logic
├── dto/
│   └── generation.dto.ts        # Request validation
├── interfaces/
│   └── generation.interface.ts  # Type definitions
└── services/
    ├── image-generation.service.ts  # Image generation logic
    └── text-generation.service.ts   # Text generation logic
```

## Error Handling

All endpoints return appropriate HTTP status codes:

- `200 OK`: Generation successful
- `400 Bad Request`: Invalid parameters
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Generation failed

Error response format:
```json
{
  "statusCode": 400,
  "message": "Failed to generate image: Invalid prompt",
  "error": "Bad Request"
}
```

## Future Enhancements

- [ ] Queue support for long-running generations
- [ ] Webhook notifications
- [ ] Batch generation
- [ ] Style presets and templates
- [ ] Generation history and analytics
- [ ] Cost tracking per user
- [ ] Image editing/variations
- [ ] Video generation support

## Notes

- Generated images are automatically uploaded to DigitalOcean Spaces
- All URLs are presigned with 3-hour expiration (or public if specified)
- Cost tracking should be implemented for production use
- Consider implementing credit/quota system per user
