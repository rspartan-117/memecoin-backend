# Sandbox Architecture Comparison: Python vs NestJS

## Overview

This document compares the sandbox management implementations between the Python backend (FastAPI) and NestJS backend to highlight the architectural patterns, responsibilities, and integration points.

---

## Architecture Patterns

### Python Backend (FastAPI) - **Primary Sandbox Manager**

**Role**: Direct sandbox management, state orchestration, caching

**File**: Python `/api/sandbox.py`

**Key Characteristics**:
- ✅ **Direct E2B SDK Integration**: Creates, pauses, resumes sandboxes
- ✅ **Multi-Layer Caching**: Memory pool → Redis (30 min) → Redis (30 days) → Database
- ✅ **State Management**: Handles RUNNING, PAUSED, KILLED states
- ✅ **Lifecycle Management**: 30-day sandbox lifecycle with automatic cleanup
- ✅ **Connection Pooling**: Maintains active sandbox instances in memory
- ✅ **Automatic Recovery**: Reconnects to paused/disconnected sandboxes

**Responsibilities**:
1. Create/connect to E2B sandboxes
2. Manage sandbox lifecycle (pause/resume/kill)
3. Multi-layer caching strategy
4. Database state synchronization
5. Public URL generation (ports 3000, 8000)
6. Automatic session restoration

---

### NestJS Backend - **API Gateway & Orchestrator**

**Role**: User-facing API, request routing, fallback data provider

**Files**:
- `src/projects/controllers/sandbox.controller.ts`
- `src/projects/services/sandbox.service.ts`

**Key Characteristics**:
- ✅ **HTTP Proxy Pattern**: Routes requests to Python backend
- ✅ **Authentication Layer**: JWT validation, user extraction
- ✅ **Database Integration**: Prisma for PostgreSQL access
- ✅ **Fallback Mechanism**: Returns DB data if Python API unavailable
- ✅ **Clean API Design**: RESTful endpoints with Swagger docs

**Responsibilities**:
1. Authenticate user requests (JWT)
2. Route sandbox operations to Python API
3. Query PostgreSQL for project metadata
4. Provide fallback data if Python unavailable
5. Return public URLs from DB cache

---

## Detailed Comparison

### 1. Endpoint Architecture

#### Python Endpoints (FastAPI)

```python
# Primary sandbox management endpoints
POST   /api/sandbox/session      # Get/create/resume sandbox (ALL-IN-ONE)
POST   /api/sandbox/pause        # Pause sandbox, save state
POST   /api/sandbox/resume       # Resume paused sandbox (alias for /session)
GET    /api/sandbox/public-url   # Get URL for specific port
```

**Key Features**:
- `/session` is the **intelligent endpoint** - handles everything:
  - Creates new sandboxes
  - Reconnects to existing sandboxes
  - Resumes paused sandboxes
  - Restores from cache/database
  - Returns frontend_url + backend_url
- Four-step retrieval: Memory → Redis 30min → Redis 30days → Database

#### NestJS Endpoints

```typescript
// User-facing API gateway
GET    /sandbox/public-urls?project_id=...  # Get frontend + backend URLs
GET    /sandbox/status?project_id=...       # Get sandbox state + metadata
```

**Key Features**:
- Simple query-based endpoints
- Authentication via JWT guard
- Proxies to Python API
- Falls back to PostgreSQL if Python unavailable

---

### 2. Request/Response Flow

#### Python Flow (Direct Management)

```
User Request
    ↓
FastAPI Endpoint
    ↓
Sandbox Manager
    ├─ Check Memory Pool (L1 cache)
    ├─ Check Redis 30min (L2 cache)
    ├─ Check Redis 30days (L3 cache)
    └─ Check PostgreSQL (source of truth)
    ↓
E2B SDK
    ├─ Create new sandbox
    ├─ Connect to existing
    └─ Resume paused
    ↓
Update All Caches + Database
    ↓
Return Response
```

#### NestJS Flow (Proxy + Fallback)

```
User Request (with JWT)
    ↓
NestJS Controller (Auth)
    ↓
SandboxService
    ├─ Call Python API (primary)
    │   └─ HTTP POST/GET to Python
    │
    └─ On Python failure:
        ├─ Query PostgreSQL
        └─ Return cached data
    ↓
Return Response
```

---

### 3. State Management Comparison

#### Python State Management

**States**: `RUNNING`, `PAUSED`, `KILLED`, `NONE`

**State Transitions**:
```
NONE → RUNNING     (create sandbox)
RUNNING → PAUSED   (pause endpoint)
PAUSED → RUNNING   (resume/session endpoint)
RUNNING → KILLED   (30-day expiry or manual kill)
```

**Caching Strategy**:
```python
# L1: Memory pool (instant access)
_sandbox_pool: Dict[str, AsyncSandbox] = {}

# L2: Redis general cache (30 min TTL)
redis.setex(f"sandbox:{user_id}:{project_id}", 1800, sandbox_id)

# L3: Redis long-term cache (30 days TTL)
redis.setex(f"sandbox:longterm:{user_id}:{project_id}", 2592000, sandbox_id)

# L4: PostgreSQL (permanent)
project.active_sandbox_id = sandbox_id
project.sandbox_state = "RUNNING"
```

**Database Updates**:
- Updates PostgreSQL on every state change
- Stores `active_sandbox_id`, `sandbox_state`, `metadata.frontend_url`, `metadata.backend_url`

#### NestJS State Management

**States**: Same ENUM as Python (`RUNNING`, `PAUSED`, `KILLED`, `NONE`)

**Database Schema** (Prisma):
```prisma
model Project {
  id                String         @id
  userId            String
  active_sandbox_id String?
  sandbox_state     SandboxState   @default(NONE)
  status            SessionStatus  @default(ACTIVE)
  metadata          Json?          // Stores frontend_url, backend_url
  ...
}

enum SandboxState {
  RUNNING
  PAUSED
  KILLED
  NONE
}
```

**Responsibility**:
- Reads state from PostgreSQL
- Does NOT update state (Python owns state management)
- Returns cached URLs from `metadata.frontend_url`/`backend_url`

---

### 4. Code Comparison

#### Python: Create/Get Session

```python
@router.post("/session", response_model=CreateSandboxSessionResponse)
async def get_or_create_session(request: CreateSandboxSessionRequest):
    """
    Intelligent endpoint that handles:
    - Create new sandbox
    - Reconnect to existing
    - Resume paused sandbox
    - Restore from cache/DB
    """
    # Use get_user_sandbox() - the ALL-IN-ONE method
    sandbox = await get_user_sandbox(request.user_id, request.project_id)

    # Get public URLs
    frontend_url = f"https://{sandbox.get_host(3000)}"
    backend_url = f"https://{sandbox.get_host(8000)}"

    return CreateSandboxSessionResponse(
        success=True,
        sandbox_id=sandbox.sandbox_id,
        user_id=request.user_id,
        project_id=request.project_id,
        frontend_url=frontend_url,
        backend_url=backend_url,
        message="Sandbox session created/retrieved successfully"
    )
```

**Key Points**:
- Single endpoint for all sandbox operations
- Returns frontend_url + backend_url immediately
- Uses E2B's `sandbox.get_host(port)` method
- Updates database with URLs in metadata

#### NestJS: Get Public URLs

```typescript
async getSandboxUrls(
  projectId: string,
  userId: string,
): Promise<SandboxUrlsResponseDto> {
  // Verify ownership
  const project = await this.prisma.project.findFirst({
    where: { id: projectId, userId },
  });

  if (!project) {
    throw new NotFoundException('Project not found');
  }

  const metadata = (project.metadata as ProjectMetadata) || {};

  // Query Python API for latest URLs
  try {
    const response = await firstValueFrom(
      this.httpService.get(`${this.pythonApiUrl}/api/sandbox/public-urls`, {
        params: { project_id: projectId },
      }),
    );

    return {
      success: true,
      project_id: projectId,
      frontend_url: response.data.frontend_url || metadata.frontend_url,
      backend_url: response.data.backend_url || metadata.backend_url,
      sandbox_id: project.active_sandbox_id || response.data.sandbox_id,
    };
  } catch (error) {
    // Fallback to DB cache
    return {
      success: true,
      project_id: projectId,
      frontend_url: metadata.frontend_url || '',
      backend_url: metadata.backend_url || '',
      sandbox_id: project.active_sandbox_id || '',
    };
  }
}
```

**Key Points**:
- Calls Python API as primary source
- Falls back to database cache on failure
- No direct E2B SDK calls
- Returns URLs from `metadata` JSON field

---

### 5. Pause/Resume Operations

#### Python: Pause Sandbox

```python
@router.post("/pause", response_model=PauseSandboxSessionResponse)
async def pause_session(request: PauseSandboxSessionRequest):
    """
    Pause sandbox and update all caches:
    - Call E2B pause() API
    - Remove from memory pool
    - Remove from general cache (30 min)
    - Keep in long-term cache (30 days)
    - Update database state to PAUSED
    """
    manager = await get_multi_tenant_manager()
    sandbox_id = await manager.pause_sandbox(user_id, project_id)

    return PauseSandboxSessionResponse(
        success=True,
        sandbox_id=sandbox_id,
        paused=True,
        message="Sandbox paused successfully. Recoverable for 30 days."
    )
```

**Pause Behavior**:
1. Calls E2B `sandbox.pause()` to save state
2. Removes from memory pool (frees RAM)
3. Removes from general cache (Redis 30 min)
4. Keeps in long-term cache (Redis 30 days) for recovery
5. Updates database: `sandbox_state = PAUSED`

#### Python: Resume Sandbox

```python
@router.post("/resume", response_model=ResumeSandboxSessionResponse)
async def resume_session(request: ResumeSandboxSessionRequest):
    """
    Resume paused sandbox (alias for /session).

    Uses get_user_sandbox() which:
    - Checks all caches
    - Reconnects to paused sandbox
    - Calls E2B resume() if needed
    - Restores to memory pool
    - Updates all caches
    """
    sandbox = await get_user_sandbox(user_id, project_id)

    return ResumeSandboxSessionResponse(
        success=True,
        sandbox_id=sandbox.sandbox_id,
        resumed=True,
        message="Sandbox ready (resumed/reconnected)"
    )
```

**Resume Flow**:
1. Check memory pool → not found
2. Check general cache (30 min) → not found
3. Check long-term cache (30 days) → **FOUND** ✅
4. Call E2B `AsyncSandbox.connect(sandbox_id)`
5. Restore to memory pool
6. Update general cache
7. Update database: `sandbox_state = RUNNING`

#### NestJS: Pause/Resume (Proxy Methods)

```typescript
// Service method - simple HTTP proxy
async pauseSandbox(userId: string, projectId: string): Promise<any> {
  const url = `${this.pythonApiUrl}/api/sandbox/pause`;

  const response = await firstValueFrom(
    this.httpService.post(url, {
      user_id: userId,
      project_id: projectId,
    }),
  );

  return response.data;
}

async resumeSandboxSession(
  userId: string,
  projectId: string
): Promise<any> {
  const url = `${this.pythonApiUrl}/api/sandbox/resume`;

  const response = await firstValueFrom(
    this.httpService.post(url, {
      user_id: userId,
      project_id: projectId,
    }),
  );

  return response.data;
}
```

**NestJS Responsibility**:
- Pure HTTP proxy to Python API
- No state management logic
- No E2B SDK calls
- No cache management

---

## 6. Caching Strategy Deep Dive

### Python Multi-Layer Cache

```
┌─────────────────────────────────────────────────────────────┐
│                    Sandbox Retrieval Flow                   │
└─────────────────────────────────────────────────────────────┘

Step 1: Memory Pool (L1 Cache)
├─ Check: _sandbox_pool[f"{user_id}:{project_id}"]
├─ Hit: Return sandbox instance (instant)
└─ Miss: Continue to Step 2

Step 2: Redis General Cache (L2 - 30 min TTL)
├─ Check: redis.get(f"sandbox:{user_id}:{project_id}")
├─ Hit: Connect to sandbox_id, add to memory pool
└─ Miss: Continue to Step 3

Step 3: Redis Long-term Cache (L3 - 30 days TTL)
├─ Check: redis.get(f"sandbox:longterm:{user_id}:{project_id}")
├─ Hit: Connect to sandbox_id, restore to all caches
└─ Miss: Continue to Step 4

Step 4: PostgreSQL (Permanent Source of Truth)
├─ Check: SELECT active_sandbox_id FROM projects WHERE id = ?
├─ Hit: Connect to sandbox_id, restore to all caches
└─ Miss: Create new sandbox

Step 5: Cache Update (On any operation)
├─ Update memory pool
├─ Update Redis 30min
├─ Update Redis 30days
└─ Update PostgreSQL
```

**Cache Invalidation**:
- **Pause**: Remove from L1 + L2, keep in L3 + L4
- **Kill**: Remove from all caches
- **Resume**: Restore to all caches

### NestJS Cache Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    NestJS Data Flow                         │
└─────────────────────────────────────────────────────────────┘

Step 1: Call Python API
├─ Primary: GET/POST to Python endpoints
├─ Success: Return Python response
└─ Failure: Continue to Step 2

Step 2: Query PostgreSQL (Fallback)
├─ Read: project.metadata.frontend_url
├─ Read: project.metadata.backend_url
├─ Read: project.active_sandbox_id
└─ Return cached data

No Write Operations:
├─ NestJS does NOT update sandbox state
├─ Python owns all state management
└─ NestJS only reads from database
```

---

## 7. Error Handling Comparison

### Python Error Handling

```python
try:
    sandbox = await get_user_sandbox(user_id, project_id)
except ValueError as e:
    # Invalid user_id or project_id
    raise HTTPException(status_code=400, detail=str(e))
except NotFoundException as e:
    # Sandbox not found in E2B
    raise HTTPException(status_code=404, detail=str(e))
except TimeoutException as e:
    # E2B API timeout
    raise HTTPException(status_code=504, detail=str(e))
except AuthenticationException as e:
    # E2B API key invalid
    raise HTTPException(status_code=401, detail=str(e))
except Exception as e:
    # Generic error
    logger.error(f"Failed: {e}", exc_info=True)
    raise HTTPException(status_code=500, detail=str(e))
```

**Error Categories**:
- Validation errors (400)
- Not found errors (404)
- Authentication errors (401)
- Timeout errors (504)
- Internal errors (500)

### NestJS Error Handling

```typescript
try {
  const response = await firstValueFrom(
    this.httpService.get(pythonUrl)
  );
  return response.data;
} catch (error) {
  // Python API unavailable - fallback to DB
  this.logger.warn(
    `Python API unavailable, returning from DB: ${error.message}`
  );

  return {
    success: true,
    project_id: projectId,
    frontend_url: metadata.frontend_url || '',
    backend_url: metadata.backend_url || '',
    sandbox_id: project.active_sandbox_id || '',
  };
}
```

**Fallback Strategy**:
- Always returns success
- Falls back to PostgreSQL cache
- Logs warnings instead of throwing errors
- Ensures frontend never breaks due to Python downtime

---

## 8. API Integration Points

### From NestJS → Python

**Endpoints Called**:

```typescript
// Create/get sandbox
POST ${pythonApiUrl}/api/sandbox/session
Body: { user_id, project_id }
Response: { success, sandbox_id, frontend_url, backend_url }

// Pause sandbox
POST ${pythonApiUrl}/api/sandbox/pause
Body: { user_id, project_id }
Response: { success, sandbox_id, paused }

// Resume sandbox
POST ${pythonApiUrl}/api/sandbox/resume
Body: { user_id, project_id }
Response: { success, sandbox_id, resumed }

// Get public URLs
GET ${pythonApiUrl}/api/sandbox/public-urls?project_id=...
Response: { frontend_url, backend_url, sandbox_id }
```

### From Frontend → NestJS

**Endpoints Exposed**:

```typescript
// Get sandbox URLs
GET /sandbox/public-urls?project_id=...
Headers: { Authorization: "Bearer <JWT>" }
Response: { success, project_id, frontend_url, backend_url, sandbox_id }

// Get sandbox status
GET /sandbox/status?project_id=...
Headers: { Authorization: "Bearer <JWT>" }
Response: {
  success,
  project_id,
  sandbox_state,
  status,
  frontend_url,
  backend_url,
  last_active
}
```

---

## 9. When to Use Each Backend

### Use Python Endpoints When:
- ✅ Creating/resuming sandboxes
- ✅ Pausing/killing sandboxes
- ✅ Managing sandbox lifecycle
- ✅ Need real-time sandbox state
- ✅ Direct E2B operations required

### Use NestJS Endpoints When:
- ✅ User authentication required
- ✅ Frontend needs public URLs
- ✅ Checking project status
- ✅ Need fallback data if Python down
- ✅ Querying project metadata

---

## 10. Architecture Best Practices

### Python Responsibilities (DO)
- ✅ Direct E2B SDK integration
- ✅ Sandbox lifecycle management
- ✅ Multi-layer caching
- ✅ State synchronization with database
- ✅ Connection pooling

### Python Responsibilities (DON'T)
- ❌ User authentication (JWT)
- ❌ Complex business logic
- ❌ Frontend-specific logic
- ❌ Direct user-facing APIs

### NestJS Responsibilities (DO)
- ✅ User authentication (JWT)
- ✅ Request validation
- ✅ API gateway/routing
- ✅ Fallback data provision
- ✅ Swagger documentation

### NestJS Responsibilities (DON'T)
- ❌ Direct E2B SDK calls
- ❌ Sandbox state management
- ❌ Cache management
- ❌ Duplicate Python logic

---

## 11. Database Schema Alignment

### PostgreSQL Schema (Prisma)

```prisma
model Project {
  id                String         @id @default(uuid())
  userId            String
  name              String
  type              ProjectType    @default(FULLSTACK)

  // Sandbox fields
  active_sandbox_id String?        // E2B sandbox ID
  sandbox_state     SandboxState   @default(NONE)
  status            SessionStatus  @default(ACTIVE)

  // Metadata (JSON)
  metadata          Json?          // {
                                   //   frontend_url: string,
                                   //   backend_url: string,
                                   //   documents: [...],
                                   //   images: [...]
                                   // }

  // Timestamps
  created_at        DateTime       @default(now())
  updated_at        DateTime       @updatedAt
  last_active       DateTime       @default(now())
}

enum SandboxState {
  RUNNING
  PAUSED
  KILLED
  NONE
}

enum SessionStatus {
  ACTIVE
  PAUSED
  ENDED
}
```

### Python Database Updates

```python
# On sandbox creation/resume
project.active_sandbox_id = sandbox.sandbox_id
project.sandbox_state = SandboxState.RUNNING
project.metadata = {
    "frontend_url": f"https://{sandbox.get_host(3000)}",
    "backend_url": f"https://{sandbox.get_host(8000)}",
    ...
}
project.last_active = datetime.now()

# On pause
project.sandbox_state = SandboxState.PAUSED

# On kill
project.active_sandbox_id = None
project.sandbox_state = SandboxState.KILLED
```

### NestJS Database Reads

```typescript
// Read only - no state updates
const project = await prisma.project.findFirst({
  where: { id: projectId, userId }
});

const metadata = project.metadata as ProjectMetadata;
const frontend_url = metadata.frontend_url;
const backend_url = metadata.backend_url;
```

---

## Summary

| Feature | Python Backend | NestJS Backend |
|---------|---------------|----------------|
| **Role** | Sandbox manager | API gateway |
| **E2B SDK** | ✅ Direct integration | ❌ No direct calls |
| **State Management** | ✅ Full lifecycle | ❌ Read-only |
| **Caching** | ✅ 3-layer Redis | ❌ None |
| **Database** | ✅ Reads + Writes | ✅ Reads only |
| **Authentication** | ❌ None | ✅ JWT |
| **Fallback** | ❌ None | ✅ DB fallback |
| **Public URLs** | ✅ Generates from E2B | ✅ Returns from cache |
| **Swagger Docs** | ✅ FastAPI auto | ✅ NestJS decorators |

**Key Takeaway**: Python owns sandbox lifecycle, NestJS provides user-facing API with authentication and fallback resilience.
