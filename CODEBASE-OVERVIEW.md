# Meme Coin LP Backend - Complete Codebase Overview

## 🎯 Project Overview

Full-stack NestJS backend for a meme coin research and generation platform. Integrates AI agents for cryptocurrency analysis, image generation, deployment automation, and payment processing.

**Primary Purpose:** Provide REST APIs for meme coin research (via Meme GPT agent), AI image generation, project deployment, GitHub integration, and user management.

---

## 🏗️ Architecture Overview

### **Tech Stack**
- **Framework:** NestJS (TypeScript)
- **Database:** PostgreSQL (via Prisma ORM)
- **Cache/Queue:** Redis + BullMQ
- **LLM Provider:** OpenRouter (Grok 4.1 Fast model)
- **Research API:** Parallel AI (Task API for deep research)
- **AI Framework:** Mastra.ai (agent orchestration)
- **Image Generation:** Fal.ai, Python backend (Railway hosted)
- **Authentication:** JWT + Web3 wallet signatures
- **Deployment:** Docker, Railway
- **API Documentation:** Swagger/OpenAPI

### **System Architecture**

```
┌─────────────────────────────────────────────────────────────┐
│                     NestJS Backend (Port 4000)              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐         │
│  │  Meme GPT  │  │ Generation │  │  Deployment  │         │
│  │   Module   │  │   Module   │  │    Module    │         │
│  └────────────┘  └────────────┘  └──────────────┘         │
│                                                             │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐         │
│  │  Payments  │  │   GitHub   │  │    Users     │         │
│  │   Module   │  │   Module   │  │    Module    │         │
│  └────────────┘  └────────────┘  └──────────────┘         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         │              │                    │
         ▼              ▼                    ▼
┌──────────────┐ ┌──────────────┐  ┌──────────────┐
│  PostgreSQL  │ │    Redis     │  │ Python API   │
│   Database   │ │ Cache/Queue  │  │ (Gen Service)│
└──────────────┘ └──────────────┘  └──────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│  External APIs:                                  │
│  - OpenRouter (Grok AI)                         │
│  - Parallel AI (Research)                       │
│  - Fal.ai (Image Gen)                           │
│  - Brand.dev (Brand data)                       │
│  - Atlos (Payments)                             │
│  - E2B (Sandboxes)                              │
└─────────────────────────────────────────────────┘
```

---

## 📂 Project Structure

```
src/
├── app.module.ts              # Root module
├── main.ts                    # Application bootstrap
├── logging.interceptor.ts     # Request/response logging
│
├── auth/                      # Authentication middleware
│   ├── auth.module.ts         # Auth routes configuration
│   └── auth.middleware.ts     # JWT validation
│
├── mastra/                    # 🔥 MEME GPT AGENT MODULE
│   ├── meme-gpt.controller.ts # REST endpoints
│   ├── meme-gpt.service.ts    # Business logic
│   ├── meme-gpt.module.ts     # Module definition
│   ├── memoryStore.ts         # Conversation persistence
│   ├── agents/
│   │   └── meme-gpt.agent.ts  # Agent configuration
│   ├── services/
│   │   ├── openrouter.service.ts  # Grok LLM client
│   │   └── parallel-ai.service.ts # Research API client
│   └── tools/
│       ├── research-meme-coin.tool.ts  # Deep research tool
│       ├── get-stored-report.tool.ts   # Cached data retrieval
│       └── refresh-coin-data.tool.ts   # Quick updates
│
├── generation/                # AI image generation
│   ├── generation.controller.ts
│   ├── generation.service.ts
│   ├── services/
│   │   ├── brand.service.ts   # Brand.dev integration
│   │   └── fal.service.ts     # Fal.ai client
│   └── dto/                   # Request/response schemas
│
├── deployment/                # Project deployment automation
│   ├── controllers/
│   ├── services/
│   │   ├── deploy.service.ts  # Main deployment logic
│   │   └── github.service.ts  # Git operations
│   └── processors/            # BullMQ job processors
│
├── github/                    # GitHub OAuth & repo management
│   ├── github.module.ts
│   ├── controllers/
│   └── services/
│
├── payments/                  # Payment processing
│   ├── payments.service.ts
│   ├── webhook.controller.ts  # Atlos webhooks
│   └── services/
│       └── atlos.service.ts   # Payment provider
│
├── users/                     # User management
│   ├── users.controller.ts
│   ├── users.service.ts
│   └── dto/
│
├── projects/                  # Project CRUD operations
│   ├── controllers/
│   ├── services/
│   │   ├── assets.service.ts  # File uploads
│   │   ├── chat.service.ts    # Project chat
│   │   └── sandbox.service.ts # E2B sandboxes
│   └── dtos/
│
├── shared/                    # Shared utilities
│   ├── services/
│   │   ├── prisma.service.ts  # Database client
│   │   └── redis-cache.service.ts
│   ├── guards/
│   │   └── jwt-auth.guard.ts  # Route protection
│   ├── filters/               # Exception handling
│   └── interceptors/
│
├── coupons/                   # Coupon system
│   ├── coupons.controller.ts
│   └── coupons.service.ts
│
└── enable3/                   # Enable3 integration (withdrawal)
    ├── enable3.controller.ts
    └── enable3.service.ts

prisma/
├── schema.prisma              # Database schema
└── seed-test-user.ts          # Test data

docs/                          # Documentation
├── FEATURE-PLAYGROUND.md
├── batch-upload-implementation.md
└── test-requests/             # HTTP test files
```

---

## 🤖 Meme GPT Agent - Core Feature

### **Overview**

AI-powered cryptocurrency research agent using:
- **LLM:** Grok 4.1 Fast (OpenRouter) - Best agentic tool calling model
- **Research API:** Parallel AI Task API for deep crypto analysis
- **Framework:** Mastra.ai for agent orchestration
- **Memory:** Prisma-backed conversation history

### **How It Works**

1. **User sends message** → Creates/retrieves session
2. **Check for existing research** → If report exists, disable tools
3. **Agent decides** → Uses tools or responds from memory
4. **Tool execution:**
   - `research_meme_coin`: Triggers 5-10min deep research via Parallel AI
   - `get_stored_report`: Retrieves cached report from DB
   - `refresh_coin_data`: Quick update using lite tier
5. **Response generated** → Saved to conversation history

### **Key Components**

#### **Agents**
- `meme-gpt.agent.ts` - Agent configuration with system prompt

#### **Services**
- `openrouter.service.ts` - Grok LLM client with tool calling
- `parallel-ai.service.ts` - Research API integration (Task API v1)

#### **Tools**
- `research-meme-coin.tool.ts` - Deep research (5-10 min)
- `get-stored-report.tool.ts` - Fetch cached data
- `refresh-coin-data.tool.ts` - Quick updates

#### **Memory**
- `memoryStore.ts` - Conversation persistence to `MemeConversation` table

### **API Endpoints**

```http
# Health check (public)
GET /meme-gpt/health

# Chat (requires JWT)
POST /meme-gpt/chat
Body: {
  "message": "Tell me about PEPE coin",
  "sessionId": "optional-session-id",  # Omit for new session
  "coinName": "PEPE"
}

# Streaming chat (SSE)
POST /meme-gpt/chat/stream
Body: { same as above }

# Get conversation history
GET /meme-gpt/sessions/:sessionId/history

# Get research report
GET /meme-gpt/sessions/:sessionId/report

# List user sessions
GET /meme-gpt/sessions/user/:userId

# Archive session
POST /meme-gpt/sessions/:sessionId/archive
```

### **Session Management**

- **WITHOUT sessionId** → Creates NEW session → Tools ENABLED → Triggers research
- **WITH sessionId** → Uses existing session → Tools DISABLED (if report exists) → Uses cached data

### **Database Schema (Meme GPT)**

```prisma
model MemeResearchSession {
  id          String            @id @default(cuid())
  userId      String
  coinName    String
  coinSymbol  String?
  status      MemeSessionStatus @default(ACTIVE)
  createdAt   DateTime          @default(now())
  lastActive  DateTime          @default(now())
  completedAt DateTime?
  metadata    Json?
  reports     MemeReport[]
  conversations MemeConversation[]
}

model MemeReport {
  id                       String              @id
  sessionId                String
  coinName                 String
  reportContent            Json
  summary                  String?
  researchDurationSeconds  Int?
  researchStatus           MemeResearchStatus
  createdAt                DateTime
}

model MemeConversation {
  id        String   @id
  sessionId String
  role      String   # 'user' | 'assistant' | 'tool'
  content   String
  metadata  Json?
  createdAt DateTime
}
```

---

## 🎨 Generation Module (Python Integration)

### **Overview**

Image generation system that communicates with external Python backend.

### **Python API Integration**

**Base URL:** `https://gen-world-game-generation-python-production-41dc.up.railway.app`

Endpoints called by NestJS:
- `POST /text-to-image` - Generate images from text
- `POST /image-to-image` - Transform images
- `POST /remove-background` - Background removal

### **NestJS Endpoints**

```http
# Generate image from text (public)
POST /generation/text-to-image
Body: {
  "prompt": "A cartoon pepe frog",
  "model": "flux-pro",
  "image_size": "landscape_4_3",
  "num_images": 1
}

# Image to image (public)
POST /generation/image-to-image
Body: {
  "image_url": "https://...",
  "prompt": "Transform to cyberpunk style"
}

# Remove background (public)
POST /generation/remove-background
Body: {
  "image_url": "https://..."
}

# Get generation results
GET /generation/results?userId=XXX

# Check webhook result
POST /generation/webhook/result
```

### **Service Architecture**

```
NestJS Generation Controller
    ↓
GenerationService
    ↓
HTTP Request to Python API
    ↓
Python Backend (FastAPI/Flask)
    ↓
Returns: { request_id, status, result_url }
    ↓
Saved to Database (generations table)
```

---

## 🔐 Authentication System

### **Flow**

1. **User requests sign message**
   ```http
   GET /user/sign-message
   Response: { message: "Sign this message: 0x..." }
   ```

2. **User signs with wallet**
   ```http
   POST /user/login
   Body: {
     "walletAddress": "0x123...",
     "signature": "0xabc..."
   }
   Response: {
     "accessToken": "jwt-token",
     "refreshToken": "refresh-token"
   }
   ```

3. **Use JWT in requests**
   ```http
   Authorization: Bearer <accessToken>
   ```

### **Protected Routes**

All routes except these require JWT:
- `/` (health)
- `/health`
- `/meme-gpt/health`
- `/user/login`
- `/user/sign-message`
- `/generation/text-to-image`
- `/generation/image-to-image`
- `/generation/remove-background`
- All `/api/*` (Swagger docs)
- Webhook endpoints

### **Test User**

For development, `AuthMiddleware` accepts `Bearer test-token`:
```typescript
// auth.middleware.ts
if (token === 'test-token') {
  req.user = 'test-user-12345';
}
```

---

## 💾 Database Schema Highlights

### **Users**
```prisma
model users {
  id              String
  walletAddress   String  @unique
  credits         Int     @default(0)
  role            UserRole
  createdAt       DateTime
  projects        projects[]
  generations     generations[]
}
```

### **Projects**
```prisma
model projects {
  id           String
  userId       String
  name         String
  description  String?
  status       ProjectStatus
  sandboxId    String?
  assets       assets[]
  deployments  deployments[]
}
```

### **Generations**
```prisma
model generations {
  id          String
  userId      String
  prompt      String
  model       String
  status      GenerationStatus
  resultUrl   String?
  falRequestId String?
  createdAt   DateTime
}
```

---

## 🚀 Deployment Module

### **Features**
- Deploy projects to production
- Custom domain management
- GitHub integration
- Screenshot generation
- Background job processing (BullMQ)

### **Endpoints**
```http
POST /deployment/deploy
POST /deployment/deploy/stream
GET  /deployment/status/:deploymentId
GET  /deployment/user
POST /deployment/domain/verify/:deploymentId
```

---

## 🔧 Environment Variables

### **Core**
```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/db

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# Server
PORT=4000
NODE_ENV=development
```

### **AI Services**
```env
# OpenRouter (Grok)
OPENROUTER_API_KEY=sk-or-v1-...
GROK_MODEL=x-ai/grok-4.1-fast

# Parallel AI (Research)
PARALLEL_AI_API_KEY=parallel-...
PARALLEL_AI_BASE_URL=https://api.parallel.ai/v1

# Fal.ai
FAL_KEY=...
```

### **Python Backend**
```env
PYTHON_API_URL=https://gen-world-game-generation-python-production-41dc.up.railway.app
```

### **Payments**
```env
ATLOS_API_KEY=...
ATLOS_BASE_URL=https://api.atlos.io
```

### **GitHub**
```env
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_CALLBACK_URL=http://localhost:4000/github/callback
```

---

## 🧪 Testing

### **Manual Testing with Swagger**

1. Start server: `yarn start:dev`
2. Open: `http://localhost:4000/api`
3. Authorize with `Bearer test-token`
4. Test endpoints

### **HTTP Test Files**

Located in `docs/test-requests/`:
- `text-to-image-tests.http`
- `image-to-image-tests.http`

### **Test User Seeding**

```bash
npx prisma db seed
# Creates test-user-12345 with 1000 credits
```

---

## 📡 Key External Integrations

### **1. OpenRouter (Grok AI)**
- **Purpose:** LLM inference for Meme GPT agent
- **Model:** `x-ai/grok-4.1-fast`
- **Authentication:** `x-api-key` header
- **Features:** Function calling, streaming

### **2. Parallel AI**
- **Purpose:** Deep cryptocurrency research
- **API:** Task API v1 (`https://api.parallel.ai/v1`)
- **Authentication:** `x-api-key` header
- **Flow:**
  1. Create task with prompt
  2. Poll for completion (5s intervals, 5min timeout)
  3. Retrieve structured result

### **3. Python Backend (Railway)**
- **Purpose:** Image generation, background removal
- **Framework:** FastAPI or Flask
- **Integration:** Direct HTTP calls from NestJS services
- **Endpoints:**
  - `/text-to-image`
  - `/image-to-image`
  - `/remove-background`

### **4. Fal.ai**
- **Purpose:** Alternative image generation
- **SDK:** `@fal-ai/serverless-client`
- **Models:** flux-pro, stable-diffusion-xl

### **5. Brand.dev**
- **Purpose:** Brand data retrieval
- **Endpoints:**
  - `POST /brand/retrieve`
  - `POST /brand/ai-query`

### **6. E2B Sandboxes**
- **Purpose:** Code execution environments
- **Webhook:** `/webhooks/e2b`

### **7. Atlos Payments**
- **Purpose:** Subscription & payment processing
- **Webhooks:**
  - `/payments/webhook/meme-coin/confirm-payin-completed`
  - `/payments/webhook/meme-coin/confirm-payin-created`

---

## 🔄 Request/Response Flow Example

### **Meme GPT Chat Flow**

```
Client → POST /meme-gpt/chat
{
  "message": "Research BONK coin",
  "coinName": "BONK"
}
    ↓
AuthMiddleware validates JWT
    ↓
MemeGptController.chat()
    ↓
MemeGptService.createNewSession(userId, "BONK")
    ↓
Check for existing report (none found)
    ↓
Tools ENABLED
    ↓
OpenRouterService.chat() with tools
    ↓
Grok decides to call research_meme_coin
    ↓
ParallelAIService.researchCoin("BONK", "deep")
    ↓
POST https://api.parallel.ai/v1/task
    ↓
Poll task status every 5s (5min timeout)
    ↓
Task completes with research data
    ↓
Transform to MemeResearchReport format
    ↓
Save to database (MemeReport table)
    ↓
Second LLM call with tool result
    ↓
Generate final response
    ↓
Save to conversation history
    ↓
Response → Client
{
  "sessionId": "abc-123",
  "response": "# BONK Research Report...",
  "timestamp": "2026-02-25T..."
}
```

---

## 🛠️ Development Commands

```bash
# Install dependencies
yarn install

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Seed database
npx prisma db seed

# Start development server
yarn start:dev

# Build for production
yarn build

# Start production server
yarn start:prod

# Run tests
yarn test

# View Prisma Studio (DB GUI)
npx prisma studio
```

---

## 📊 Performance Considerations

### **Caching Strategy**
- Redis cache for brand data
- In-memory conversation history (last 20 messages)
- Research reports stored in PostgreSQL

### **Background Jobs (BullMQ)**
- Deployment processing
- Image generation webhooks
- Payment confirmations

### **Rate Limiting**
- ThrottlerModule configured globally
- Specific limits per endpoint

### **Timeouts**
- Parallel AI research: 5 minutes
- Python API calls: 2 minutes
- OpenRouter streaming: No timeout

---

## 🐛 Common Issues & Solutions

### **1. Port 4000 in use**
```powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 4000).OwningProcess | Stop-Process -Force
```

### **2. Prisma client out of sync**
```bash
npx prisma generate
```

### **3. Redis connection failed**
- Check Redis is running
- Verify `REDIS_HOST` and `REDIS_PORT` in `.env`

### **4. Python API timeout**
- Verify Python backend is running
- Check `PYTHON_API_URL` in `.env`

### **5. Parallel AI research fails**
- Verify `PARALLEL_AI_API_KEY` is valid
- Check task status in logs
- Ensure sufficient credits in Parallel AI account

---

## 🔍 Monitoring & Logging

### **Log Levels**
- Application logs via NestJS Logger
- Request/response logging via LoggingInterceptor
- Tool execution logs in MemeGptService

### **Health Checks**
- `GET /health` - Main health check
- `GET /meme-gpt/health` - Meme GPT module health

### **Metrics**
- Prometheus metrics at `/metrics` (PrometheusController)

---

## 🤝 Integration with Python Backend

### **What Python Backend Should Know**

1. **Authentication:** NestJS forwards user context, no auth needed on Python side
2. **Response Format:**
   ```json
   {
     "request_id": "unique-id",
     "status": "processing|completed|failed",
     "result_url": "https://...",
     "error": "optional error message"
   }
   ```
3. **Webhooks:** Python can POST results to `/generation/webhook/result`
4. **Credits:** NestJS handles credit deduction, Python just processes

### **Expected Python Endpoints**

```python
# FastAPI example
from fastapi import FastAPI

app = FastAPI()

@app.post("/text-to-image")
async def text_to_image(request: TextToImageRequest):
    # Process request
    # Return: { request_id, status, result_url }
    pass

@app.post("/image-to-image")
async def image_to_image(request: ImageToImageRequest):
    pass

@app.post("/remove-background")
async def remove_background(request: BackgroundRemovalRequest):
    pass
```

---

## 📚 Additional Resources

### **Documentation Files**
- `ATLOS-INTEGRATION-GUIDE.md` - Payment integration
- `MEME_GPT_AGENT_DOCUMENTATION.md` - Detailed Meme GPT docs
- `MEME-GPT-SETUP-GUIDE.md` - Setup instructions
- `TEST-USER-README.md` - Test user guide
- `docs/FEATURE-PLAYGROUND.md` - Feature overview
- `docs/batch-upload-implementation.md` - Batch upload guide

### **API Schemas**
- Swagger UI: `http://localhost:4000/api`
- OpenAPI JSON: `http://localhost:4000/api-json`

---

## 🎯 Key Takeaways for Python Integration

1. **NestJS handles:**
   - Authentication
   - Database operations
   - Business logic
   - Credit management
   - LLM orchestration

2. **Python backend handles:**
   - Image generation
   - Background removal
   - Heavy AI model inference

3. **Communication flow:**
   - NestJS → HTTP POST to Python
   - Python → Process & return JSON
   - Optional: Python → Webhook to NestJS

4. **No shared database** - Communication via HTTP APIs only

5. **Error handling:**
   - Python returns error in response
   - NestJS handles user-facing error messages

---

## 📞 Support & Contact

For questions about this codebase, refer to:
- Swagger API docs at `/api`
- Prisma schema at `prisma/schema.prisma`
- Environment template at `.env.example`

---

**Last Updated:** February 25, 2026  
**Version:** 1.0.0  
**Framework:** NestJS 10.x  
**Node.js:** v22.17.1
