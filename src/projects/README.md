# Projects Module

Complete NestJS API gateway for AI-powered project management with support for chat, asset management, downloads, and sandbox operations.

## Overview

The Projects Module provides a comprehensive REST API for managing AI agent projects. It acts as a gateway between the NestJS backend and a Python-based AI agent execution service, handling project lifecycle, file uploads, conversation streaming, and sandbox management.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        NestJS Backend                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   Projects Module                         │   │
│  │                                                            │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐          │   │
│  │  │  Projects  │  │   Assets   │  │  Download  │          │   │
│  │  │ Controller │  │ Controller │  │ Controller │  ...     │   │
│  │  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘          │   │
│  │        │               │               │                  │   │
│  │  ┌─────▼───────────────▼───────────────▼──────┐          │   │
│  │  │         ProjectsService / AssetsService     │          │   │
│  │  └─────┬───────────────────────────────────┬───┘          │   │
│  └────────┼───────────────────────────────────┼──────────────┘   │
│           │                                   │                  │
│     ┌─────▼─────────┐                  ┌──────▼─────────┐       │
│     │ PostgreSQL DB │                  │  S3/Spaces     │       │
│     │ (Prisma ORM)  │                  │  File Storage  │       │
│     └───────────────┘                  └────────────────┘       │
└───────────────┬─────────────────────────────────────────────────┘
                │
                │ HTTP Proxy
                │
        ┌───────▼────────────────────────────────────────┐
        │          Python AI Agent Backend               │
        │  (AI execution, sandbox, streaming responses)  │
        └────────────────────────────────────────────────┘
```

## Features

### 🎯 Core Capabilities

- **Project Lifecycle Management**: Create, list, get, pause, resume, and delete projects
- **Real-time Chat**: SSE (Server-Sent Events) streaming for AI agent conversations
- **Asset Management**: Upload and manage documents, images, and generic files
- **Download/Export**: Create ZIP archives, list downloads, and cleanup old files
- **Sandbox Management**: Get sandbox URLs and status information
- **Authentication**: JWT-based authentication on all routes
- **Ownership Enforcement**: All operations verify project ownership

### 📁 Module Structure

```
src/projects/
├── controllers/
│   ├── projects.controller.ts      # Project lifecycle & chat routes
│   ├── assets.controller.ts        # Asset upload & management
│   ├── download.controller.ts      # ZIP download & export
│   └── sandbox.controller.ts       # Sandbox URLs & status
├── services/
│   ├── projects.service.ts         # Core project business logic
│   └── assets.service.ts           # Asset upload & processing
├── dtos/
│   ├── create-project.dto.ts       # Project creation
│   ├── chat.dto.ts                 # Chat request/response
│   ├── upload-document.dto.ts      # Document upload
│   ├── upload-image.dto.ts         # Image upload
│   ├── download-request.dto.ts     # Download requests
│   └── ... (15 DTOs total)
└── projects.module.ts              # Module definition
```

## API Routes

### Project Lifecycle Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects` | Create a new project |
| GET | `/projects` | List all user's projects |
| GET | `/projects/:id` | Get project details |
| GET | `/projects/:id/resume` | Resume a paused project |
| POST | `/projects/:id/pause` | Pause an active project |
| DELETE | `/projects/:id` | Delete a project |
| POST | `/projects/:id/chat` | Stream chat with AI agent (SSE) |
| GET | `/projects/:id/history` | Get conversation history |
| GET | `/projects/:id/state` | Get project state |

### Asset Management Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects/:projectId/assets/documents` | Upload a document (PDF, TXT, etc.) |
| POST | `/projects/:projectId/assets/images` | Upload an image (PNG, JPG, etc.) |
| POST | `/projects/:projectId/assets` | Upload a generic file |
| GET | `/projects/:projectId/assets` | List all project assets |
| DELETE | `/projects/:projectId/assets/:assetId` | Delete an asset |

### Download/Export Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects/:projectId/download` | Create a ZIP archive |
| GET | `/projects/:projectId/download/list` | List available ZIPs |
| DELETE | `/projects/:projectId/download/cleanup` | Cleanup old ZIPs |

### Sandbox Management Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/sandbox/public-urls?project_id=<id>` | Get sandbox URLs |
| GET | `/sandbox/status?project_id=<id>` | Get sandbox status |

## Usage Examples

### 1. Create a New Project

```bash
POST /projects
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "My AI Project",
  "description": "Building a web application with AI assistance"
}
```

**Response:**
```json
{
  "id": "uuid-here",
  "name": "My AI Project",
  "description": "Building a web application with AI assistance",
  "status": "ACTIVE",
  "metadata": {},
  "userId": "user-uuid",
  "createdAt": "2025-01-05T12:00:00Z",
  "updatedAt": "2025-01-05T12:00:00Z"
}
```

### 2. Chat with AI Agent (SSE Streaming)

```bash
POST /projects/{projectId}/chat
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "message": "Help me build a REST API with authentication"
}
```

**Response (SSE Stream):**
```
event: agent_thinking
data: {"token": "I'll", "node": "model"}

event: agent_thinking
data: {"token": " help", "node": "model"}

event: agent_complete
data: {"timestamp": "2025-01-05T12:00:00Z"}
```

### 3. Upload a Document

```bash
POST /projects/{projectId}/assets/documents
Authorization: Bearer <jwt_token>
Content-Type: multipart/form-data

file: <file.pdf>
```

**Response:**
```json
{
  "message": "Document uploaded successfully",
  "assetId": "asset-uuid",
  "fileUrl": "https://s3.amazonaws.com/...",
  "metadata": {
    "filename": "file.pdf",
    "file_type": "application/pdf",
    "file_size": 123456,
    "rag_processed": false
  }
}
```

### 4. Create a ZIP Download

```bash
POST /projects/{projectId}/download
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "source_path": "/src",
  "zip_name": "my-project.zip",
  "exclude_patterns": ["*.log", "node_modules/**"],
  "use_defaults": true
}
```

**Response:**
```json
{
  "message": "ZIP created successfully",
  "zip_url": "https://s3.amazonaws.com/.../my-project.zip",
  "zip_path": "/tmp/my-project.zip",
  "size_bytes": 1024000,
  "expiration": "2025-01-06T12:00:00Z"
}
```

### 5. Get Sandbox URLs

```bash
GET /sandbox/public-urls?project_id={projectId}
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "project_id": "uuid-here",
  "urls": {
    "preview": "https://preview.sandbox.com/...",
    "terminal": "https://terminal.sandbox.com/..."
  },
  "status": "running"
}
```

## Data Flow

### Chat Request Flow

```
1. Client sends POST /projects/:id/chat with message
   ↓
2. ProjectsController extracts user ID from JWT
   ↓
3. Verifies project ownership via database
   ↓
4. Extracts RAG context from project metadata
   ↓
5. Proxies request to Python backend with SSE
   ↓
6. Streams response back to client
   ↓
7. Client receives real-time AI responses
```

### Asset Upload Flow

```
1. Client uploads file via multipart/form-data
   ↓
2. AssetsController receives file with Multer
   ↓
3. Verifies project ownership
   ↓
4. Uploads file to S3/DigitalOcean Spaces
   ↓
5. Sends file URL to Python backend for processing
   ↓
6. Updates project metadata in database
   ↓
7. Returns success response with file URL
```

## Configuration

### Environment Variables

```env
# Python AI Backend
PYTHON_API_URL=https://your-python-backend.com

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# S3/DigitalOcean Spaces
DIGITALOCEAN_SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
DIGITALOCEAN_SPACES_BUCKET=your-bucket
DIGITALOCEAN_SPACES_ACCESS_KEY=your-access-key
DIGITALOCEAN_SPACES_SECRET_KEY=your-secret-key

# JWT
JWT_SECRET=your-jwt-secret
```

### Python Backend Integration

The module expects the Python backend to implement these endpoints:

- `POST /api/projects/create` - Create project session
- `POST /api/projects/:id/chat` - Chat with streaming
- `GET /api/projects/:id/pause` - Pause project
- `GET /api/projects/:id/resume` - Resume project
- `DELETE /api/projects/:id` - Delete project
- `GET /api/projects/:id/history` - Get history
- `GET /api/projects/:id/state` - Get state
- `POST /api/sandbox/session` - Create sandbox
- `GET /api/sandbox/urls` - Get sandbox URLs
- `GET /api/sandbox/status` - Get sandbox status
- `POST /api/assets/process` - Process uploaded assets
- `POST /api/download/create` - Create ZIP
- `GET /api/download/list` - List ZIPs
- `DELETE /api/download/cleanup` - Cleanup ZIPs

## Database Schema

The module uses the existing `Project` model in Prisma:

```prisma
model Project {
  id          String   @id @default(dbgenerated("gen_random_uuid()"))
  name        String
  description String?
  status      String   @default("ACTIVE")
  metadata    Json     @default("{}")
  userId      String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user        users    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("projects")
}
```

### Metadata Structure

The `metadata` JSON field stores:

```typescript
{
  documents: [
    {
      filename: string,
      file_type: string,
      file_size: number,
      file_url: string,
      rag_processed: boolean,
      summary?: string
    }
  ],
  images: [
    {
      filename: string,
      file_type: string,
      file_size: number,
      file_url: string,
      rag_processed: boolean
    }
  ],
  conversation_history: [
    {
      role: "user" | "assistant" | "system",
      content: string,
      timestamp: string
    }
  ],
  sandbox_urls?: {
    preview: string,
    terminal: string
  }
}
```

## Authentication & Authorization

All routes are protected with `JwtAuthGuard`:

```typescript
@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  // All routes require valid JWT token
}
```

**Ownership verification** is enforced on all operations:

```typescript
// Verify user owns the project
const project = await this.prisma.project.findFirst({
  where: {
    id: projectId,
    userId: userId  // ← Ensures ownership
  }
});

if (!project) {
  throw new NotFoundException('Project not found');
}
```

## Error Handling

The module uses standard NestJS HTTP exceptions:

- `NotFoundException` - Project or asset not found
- `BadRequestException` - Invalid request data
- `UnauthorizedException` - Invalid or missing JWT
- `InternalServerErrorException` - Python backend errors

## Testing

### Manual Testing with cURL

```bash
# Get JWT token first
TOKEN="your-jwt-token-here"

# Create project
curl -X POST http://localhost:3000/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Project"}'

# Chat with AI
curl -X POST http://localhost:3000/projects/{id}/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello AI"}' \
  --no-buffer

# Upload document
curl -X POST http://localhost:3000/projects/{id}/assets/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@document.pdf"
```

## Dependencies

### Required NestJS Modules
- `@nestjs/common`
- `@nestjs/axios` - HTTP requests to Python backend
- `@nestjs/swagger` - API documentation
- `@nestjs/platform-express` - File uploads

### External Services
- PostgreSQL database (via Prisma)
- S3-compatible storage (S3/DigitalOcean Spaces)
- Python AI agent backend
- Redis (for caching, via SharedModule)

### File Upload
- `multer` - Multipart file handling
- `@types/multer` - TypeScript definitions

## Performance Considerations

### Streaming Optimization
- SSE streaming uses chunked transfer encoding
- Response buffering disabled for real-time updates
- Timeout set to 60 seconds for long-running operations

### Database Optimization
- Ownership verification done in single query
- Metadata updates use JSON operations
- Indexes on `userId` and `id` for fast lookups

### File Upload Optimization
- Files uploaded directly to S3 (not stored locally)
- Parallel uploads to Python backend
- Presigned URLs for secure access

## Migration from game-generation Module

This module **replaces** the deprecated `game-generation` and `fullstack` modules:

| Old Module | New Module | Changes |
|------------|------------|---------|
| `GameGenerationModule` | `ProjectsModule` | Cleaner architecture, better separation |
| `StreamCaptureService` | Direct SSE in controller | Simplified streaming |
| `/game-generation/*` routes | `/projects/*` routes | More RESTful design |

## Future Enhancements

- [ ] WebSocket support for bidirectional communication
- [ ] File upload progress tracking
- [ ] Batch asset uploads
- [ ] Project templates
- [ ] Collaboration features (shared projects)
- [ ] Asset versioning
- [ ] Advanced RAG filtering options

## Troubleshooting

### Common Issues

**Issue**: "Project not found" error
- **Cause**: User doesn't own the project or invalid project ID
- **Solution**: Verify project ownership and ID

**Issue**: Python backend connection timeout
- **Cause**: Python service is down or unreachable
- **Solution**: Check `PYTHON_API_URL` environment variable

**Issue**: File upload fails
- **Cause**: S3 credentials invalid or bucket doesn't exist
- **Solution**: Verify S3 configuration in environment variables

**Issue**: SSE stream disconnects
- **Cause**: Network timeout or proxy buffering
- **Solution**: Increase timeout, disable proxy buffering

## Support

For issues or questions:
1. Check the [main README](../../README.md)
2. Review the API documentation at `/api` (Swagger UI)
3. Contact the development team

## License

This module is part of the Meme Coin backend application.

---

**Generated with [Claude Code](https://claude.com/claude-code)**
