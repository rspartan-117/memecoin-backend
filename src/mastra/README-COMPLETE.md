# Meme GPT Agent - Complete Setup Guide

✅ **Status**: Fully implemented and ready to use

## 🌟 Overview

Meme GPT is an AI-powered meme coin research agent that provides deep-dive analysis using:
- **Parallel AI Task API**: 4 concurrent research tasks (price, sentiment, social, whale analysis)
- **Grok 4.1 Fast via OpenRouter**: Agent orchestration and chat interface ($0.03/1M tokens)
- **PostgreSQL**: Persistent storage for sessions, reports, conversations

## 🏗️ Complete Architecture

```
MemeGptModule (NestJS)
├── Controller (REST API + SSE streaming)
│   └── Endpoints: /meme-gpt/*
├── Service (Business logic)
│   ├── Session management
│   ├── Chat processing
│   ├── Tool orchestration
│   └── Streaming support
├── Services
│   ├── ParallelAIService
│   │   ├── researchCoin() - 4 parallel tasks
│   │   ├── quickUpdate() - 2 tasks (price + sentiment)
│   │   ├── waitForTasks() - Polling mechanism
│   │   └── calculateRiskScore() - 0-100 scoring
│   └── OpenRouterService
│       ├── chat() - Non-streaming completion
│       ├── streamChat() - SSE streaming
│       └── Tool calling support
├── Tools (Agent-callable)
│   ├── research_meme_coin - Full analysis (60-180s)
│   ├── get_stored_report - Retrieve cached reports (<1s)
│   └── refresh_coin_data - Quick update (30-60s)
├── Memory Store
│   └── MemeGPTMemoryStore (PostgreSQL-backed)
└── Database Models (Prisma)
    ├── MemeResearchSession
    ├── MemeReport
    └── MemeConversation
```

## 🔧 Setup Instructions

### Step 1: Install Dependencies

```bash
npm install uuid
npm install --save-dev @types/uuid
```

### Step 2: Add Environment Variables

Add to your `.env` file:

```bash
# Parallel AI Task API
PARALLEL_AI_API_KEY=your_parallel_ai_api_key
PARALLEL_AI_BASE_URL=https://api.parallellabs.ai/v1

# OpenRouter (Grok 4.1 Fast)
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
GROK_MODEL=x-ai/grok-beta

# Domain for OpenRouter referrer
SELF_DOMAIN=http://localhost:4000
```

### Step 3: Run Database Migration

```bash
npx prisma migrate dev --name add_meme_gpt_tables
npx prisma generate
```

This creates 3 tables:
- `MemeResearchSession` - Conversation sessions
- `MemeReport` - Research results (JSON reports)
- `MemeConversation` - Chat history

### Step 4: Start Server

```bash
npm run start:dev
```

The Meme GPT module is now live at `http://localhost:4000/meme-gpt/*`

## 📡 API Endpoints

### 1. Chat (Non-Streaming)

```http
POST /meme-gpt/chat
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "message": "Research Dogecoin for me",
  "sessionId": "optional-uuid",
  "coinName": "DOGE"
}
```

**Response:**
```json
{
  "sessionId": "a1b2c3d4-...",
  "response": "I'll conduct a comprehensive analysis of Dogecoin...",
  "timestamp": "2025-01-20T12:00:00.000Z"
}
```

### 2. Chat (Streaming SSE)

```http
POST /meme-gpt/chat/stream
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "message": "What's SHIB's current price?",
  "sessionId": "a1b2c3d4-..."
}
```

**SSE Stream:**
```
data: {"type":"token","data":"SHIB "}
data: {"type":"token","data":"is "}
data: {"type":"token","data":"currently "}
data: {"type":"tool_call","data":[...]}
data: {"type":"done","data":null}
```

### 3. Get Session History

```http
GET /meme-gpt/sessions/:sessionId/history
Authorization: Bearer <jwt_token>
```

### 4. Get Research Report

```http
GET /meme-gpt/sessions/:sessionId/report
Authorization: Bearer <jwt_token>
```

### 5. Get User Sessions

```http
GET /meme-gpt/sessions/user/:userId
Authorization: Bearer <jwt_token>
```

### 6. Archive Session

```http
POST /meme-gpt/sessions/:sessionId/archive
Authorization: Bearer <jwt_token>
```

### 7. Health Check

```http
GET /meme-gpt/health
```

## 🛠️ How It Works

### Research Flow

1. **User sends message**: "Research PEPE coin"
2. **Agent checks for cached report**: `get_stored_report` tool
3. **If not found, launches full research**: `research_meme_coin` tool
   - Parallel AI launches 4 tasks simultaneously:
     - Price analysis
     - Sentiment analysis
     - Social metrics
     - Whale activity
   - Waits 60-180 seconds for completion
   - Aggregates results
   - Calculates risk score (0-100)
   - Saves to database
4. **Agent presents analysis**: Formatted report with:
   - Summary
   - Risk score & category
   - Key findings
   - Risk factors + strengths
   - Investment recommendation

### Quick Update Flow

1. **User asks for price**: "What's DOGE's price?"
2. **Agent uses quick refresh**: `refresh_coin_data` tool
3. **Parallel AI launches 2 tasks**: Price + sentiment only
4. **Returns in 30-60 seconds**: Current price, 24h change, sentiment

## 📊 Tool Details

### `research_meme_coin`

**Purpose**: Comprehensive deep-dive research

**Duration**: 60-180 seconds

**Parallel AI Tasks**:
1. **Price Analysis**
   - Current price, market cap, volume
   - 24h/7d price change
   - All-time high (ATH) and date
   - Historical trend analysis

2. **Sentiment Analysis**
   - Twitter mentions & sentiment
   - Reddit posts & sentiment
   - News articles analysis
   - Overall sentiment score (0-100)

3. **Social Metrics**
   - Twitter followers count
   - Reddit subscribers
   - Community activity level
   - Growth rate (7d, 30d)

4. **Whale Activity**
   - Top 10 holders percentage
   - Recent large transactions
   - Whale accumulation/distribution
   - Concentration risk

**Output**:
- Full report saved to database
- Risk score calculated (0-100)
- Risk factors identified
- Strengths highlighted
- Investment recommendation

### `get_stored_report`

**Purpose**: Retrieve cached research reports

**Duration**: < 1 second (database query)

**Logic**:
- Searches for most recent completed report
- Case-insensitive coin name matching
- Optional session filtering
- Returns report age
- Suggests refresh if > 24 hours old

**Use Case**: ALWAYS check before running new research to avoid duplicate work

### `refresh_coin_data`

**Purpose**: Quick price & sentiment update

**Duration**: 30-60 seconds

**Parallel AI Tasks**:
1. Price analysis (current + 24h change)
2. Sentiment analysis (Twitter + Reddit)

**Output**:
- Lightweight update (NOT saved to DB)
- Quick summary sentence
- Latest price & sentiment score

**Use Case**: "What's the current price?", "Latest status?", Refreshing old reports

## 🔒 Security Features

- **JWT Authentication**: All endpoints require valid token
- **User Isolation**: Users can only access their own sessions
- **Admin Override**: Admin role can view all sessions
- **Rate Limiting**: ThrottlerGuard applied globally (30 req/min production)
- **Input Validation**: All user inputs sanitized
- **API Key Protection**: Keys stored in environment variables

## 💰 Cost Breakdown

| Service | Model | Pricing | Usage |
|---------|-------|---------|-------|
| OpenRouter | Grok 4.1 Fast | $0.03/1M tokens | Agent chat + orchestration |
| Parallel AI | Task API | Tiered (Lite/Base) | Research tasks |

**Example Cost per Research**:
- Full research: ~2K tokens (agent) + 4 Parallel AI tasks
- Approx: $0.0001 (Grok) + Parallel AI task cost
- Very cost-effective!

## 🧪 Testing

### Health Check

```bash
curl http://localhost:4000/meme-gpt/health
```

### Chat Test (requires JWT)

```bash
curl -X POST http://localhost:4000/meme-gpt/chat \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Research Dogecoin for me"
  }'
```

### Get Sessions

```bash
curl http://localhost:4000/meme-gpt/sessions/user/YOUR_USER_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| "PARALLEL_AI_API_KEY not found" | Add API key to `.env` file |
| "OPENROUTER_API_KEY not found" | Add OpenRouter key to `.env` |
| Database errors | Run `npx prisma migrate dev` |
| "Session not found" | Create session with POST /meme-gpt/chat |
| Tool execution timeout | Increase timeout in parallel-ai.service.ts |
| JWT auth failure | Verify token in Authorization header |

## 📝 Database Schema

### MemeResearchSession

```prisma
model MemeResearchSession {
  id            String              @id @default(uuid())
  userId        String
  coinName      String
  status        MemeSessionStatus   @default(ACTIVE)
  metadata      Json                @default({})
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt
 
  user          users               @relation(...)
  reports       MemeReport[]
  conversations MemeConversation[]
}
```

### MemeReport

```prisma
model MemeReport {
  id                       String               @id @default(uuid())
  sessionId                String
  coinName                 String
  reportContent            Json                 // Full research data
  summary                  String               @db.Text
  researchDurationSeconds  Int
  researchStatus           MemeResearchStatus
  createdAt                DateTime             @default(now())
  
  session                  MemeResearchSession  @relation(...)
}
```

### MemeConversation

```prisma
model MemeConversation {
  id        String              @id @default(uuid())
  sessionId String
  role      String              // 'user' | 'assistant' | 'system' | 'tool'
  content   String              @db.Text
  metadata  Json                @default({})
  createdAt DateTime            @default(now())
  
  session   MemeResearchSession @relation(...)
}
```

## 📚 Files Created

### Core Module (7 files)
1. ✅ `meme-gpt.module.ts` - NestJS module definition
2. ✅ `meme-gpt.service.ts` - Business logic (500+ lines)
3. ✅ `meme-gpt.controller.ts` - REST API endpoints
4. ✅ `memoryStore.ts` - PostgreSQL-backed conversation persistence

### Services (2 files)
5. ✅ `services/parallel-ai.service.ts` - Parallel AI integration (400+ lines)
6. ✅ `services/openrouter.service.ts` - Grok LLM interface (150+ lines)

### Tools (4 files)
7. ✅ `tools/index.ts` - Tool exports
8. ✅ `tools/research-meme-coin.tool.ts` - Full research implementation
9. ✅ `tools/get-stored-report.tool.ts` - Cached report retrieval
10. ✅ `tools/refresh-coin-data.tool.ts` - Quick update implementation

### Agent Configuration (1 file)
11. ✅ `agents/meme-gpt.agent.ts` - 330-line system prompt

### Database (1 file)
12. ✅ `prisma/schema.prisma` - Updated with 3 new models + 2 enums

### Configuration (2 files)
13. ✅ `.env.meme-gpt.example` - Environment variable template
14. ✅ `README-COMPLETE.md` - This comprehensive guide

### Integration (1 file)
15. ✅ `app.module.ts` - MemeGptModule registered

**Total**: 15 files created/modified ✅

## 🚀 Next Steps

1. **Get API Keys**:
   - Parallel AI: https://parallellabs.ai
   - OpenRouter: https://openrouter.ai

2. **Configure Environment**:
   - Copy `.env.meme-gpt.example` to `.env`
   - Add your API keys

3. **Run Migration**:
   ```bash
   npx prisma migrate dev --name add_meme_gpt_tables
   ```

4. **Install Dependencies**:
   ```bash
   npm install uuid
   npm install --save-dev @types/uuid
   ```

5. **Start Server**:
   ```bash
   npm run start:dev
   ```

6. **Test Integration**:
   ```bash
   curl http://localhost:4000/meme-gpt/health
   ```

## 💡 Usage Tips

1. **Always check cached reports first**: Saves time & API costs
2. **Use quick refresh for price checks**: 2x faster than full research
3. **Archive old sessions**: Keeps database clean
4. **Monitor Parallel AI usage**: Track task consumption
5. **Set up error alerts**: Monitor failed research attempts

## 📖 Additional Resources

- [Meme GPT Agent Documentation](../MEME_GPT_AGENT_DOCUMENTATION.md) - Original 330-line guide
- [Parallel AI API Docs](https://parallellabs.ai/docs)
- [OpenRouter API Reference](https://openrouter.ai/docs)
- [Grok Model Info](https://openrouter.ai/models/x-ai/grok-beta)
- [NestJS Documentation](https://docs.nestjs.com)
- [Prisma ORM Guide](https://www.prisma.io/docs)

---

**Implementation Complete** ✅

All components are fully implemented and ready for production use. The system integrates seamlessly with your existing NestJS backend and provides a powerful AI research agent for meme coin analysis.
