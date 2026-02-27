# Meme GPT Agent - Complete Documentation

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [System Requirements](#system-requirements)
4. [Database Schema](#database-schema)
5. [Environment Variables](#environment-variables)
6. [Agent Configuration](#agent-configuration)
7. [Tools & Capabilities](#tools--capabilities)
8. [API Endpoints](#api-endpoints)
9. [Agent Workflow](#agent-workflow)
10. [Integration Guide (NestJS/Mastra)](#integration-guide-nestjsmastra)
11. [Testing & Examples](#testing--examples)
12. [Error Handling](#error-handling)
13. [Performance & Optimization](#performance--optimization)

---

## Overview

**Meme GPT** is an AI-powered meme coin research agent that provides comprehensive market analysis through parallel data gathering and interactive Q&A. It uses:

- **Grok 4.1 Fast** (via OpenRouter) - Cost-effective LLM ($0.03/1M tokens)
- **Parallel AI Task API** - Concurrent research orchestration
- **PostgreSQL** - Structured data storage
- **MongoDB** - Conversation checkpointing
- **LangGraph** - Agent orchestration framework

### Key Features

✅ **Parallel Research**: 4 concurrent tasks (60-180 seconds)
- Price & Market Analysis
- Sentiment Analysis (Twitter/Reddit)
- Social Metrics (community size, engagement)
- Whale Activity (on-chain movements)

✅ **Interactive Q&A**: Follow-up questions with context awareness

✅ **Persistent Storage**: Reports saved to PostgreSQL, conversations to MongoDB

✅ **Streaming Responses**: Real-time SSE (Server-Sent Events)

✅ **Risk Assessment**: Automated scoring (0-100) with recommendations

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Request                        │
│         POST /meme-gpt/chat {"message": "Research DOGE"}    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Router                            │
│              (api/meme_gpt_api.py)                          │
│  - Validate request                                         │
│  - Auto-create user if needed                               │
│  - Generate/retrieve session_id                             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Meme GPT Agent                            │
│              (agent/meme_agent.py)                          │
│  - State Graph with 3 tools                                 │
│  - Grok 4.1 Fast model                                      │
│  - MongoDB checkpointing                                    │
└────────────────────────┬────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
    ┌─────────┐   ┌─────────┐   ┌─────────┐
    │research_│   │get_stored│   │refresh_ │
    │meme_coin│   │_report  │   │coin_data│
    └────┬────┘   └────┬────┘   └────┬────┘
         │             │              │
         ▼             │              │
  ┌──────────────┐    │              │
  │ Parallel AI  │    │              │
  │   Service    │◄───┘              │
  │  4 Tasks     │◄──────────────────┘
  └──────┬───────┘
         │
         ├─► Task 1: Price Analysis (45-60s)
         ├─► Task 2: Sentiment Analysis (60-90s)
         ├─► Task 3: Social Metrics (30-45s)
         └─► Task 4: Whale Activity (45-75s)
                │
                ▼
         ┌──────────────┐
         │Aggregate     │
         │Results       │
         │+ Risk Score  │
         └──────┬───────┘
                │
                ▼
         ┌──────────────┐          ┌──────────────┐
         │PostgreSQL    │          │MongoDB       │
         │(Reports)     │          │(Checkpoints) │
         └──────────────┘          └──────────────┘
                │
                ▼
         ┌──────────────┐
         │Stream to     │
         │Client (SSE)  │
         └──────────────┘
```

### Component Breakdown

| Component | Purpose | Technology |
|-----------|---------|------------|
| **Meme Agent** | Orchestrates research flow | LangGraph + Grok 4.1 Fast |
| **Parallel AI Service** | Concurrent data gathering | Parallel AI Task API |
| **Meme Research Tools** | Agent callable functions | LangChain tools |
| **Database Service** | Data persistence | PostgreSQL + SQLAlchemy |
| **Checkpointer** | Conversation state | MongoDB + LangGraph |
| **API Router** | HTTP endpoints | FastAPI + SSE |

---

## System Requirements

### Dependencies

```toml
# Core Framework
fastapi>=0.122.0
uvicorn[standard]>=0.38.0

# Agent Framework
langchain>=1.1.0
langchain-openai>=1.1.0
langgraph>=0.2.0
langgraph-checkpoint-mongodb==0.2.2

# Database
sqlalchemy>=2.0.44
asyncpg>=0.31.0
pymongo>=4.0.0

# HTTP Client
httpx>=0.27.0

# Environment
pydantic-settings>=2.12.0
python-dotenv>=1.2.1
```

### Minimum Hardware

- **CPU**: 2+ cores
- **RAM**: 4GB+
- **Storage**: 1GB+ for logs/checkpoints

### API Keys Required

1. **OpenRouter API Key** - For Grok 4.1 Fast model
2. **Parallel AI API Key** - For concurrent research tasks
3. **PostgreSQL Database** - For structured data
4. **MongoDB Atlas** - For conversation checkpointing

---

## Database Schema

### PostgreSQL Tables

#### 1. `meme_research_sessions`

Stores research session metadata.

```sql
CREATE TABLE meme_research_sessions (
    id VARCHAR PRIMARY KEY,                    -- Session/Thread ID (UUID)
    "userId" VARCHAR NOT NULL,                 -- User identifier
    "coinName" VARCHAR NOT NULL,               -- Coin being researched
    "coinSymbol" VARCHAR NULL,                 -- Optional ticker symbol
    status "MemeSessionStatus" NOT NULL,       -- ACTIVE/COMPLETED/ARCHIVED
    "createdAt" TIMESTAMP(6) NOT NULL,         -- Session creation time
    "lastActive" TIMESTAMP(6) NOT NULL,        -- Last interaction
    "completedAt" TIMESTAMP(6) NULL,           -- Completion time
    metadata JSONB NULL,                       -- Additional data
    CONSTRAINT meme_research_sessions_pkey PRIMARY KEY (id)
);

CREATE TYPE "MemeSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');

-- Indexes
CREATE INDEX idx_meme_sessions_user ON meme_research_sessions("userId");
CREATE INDEX idx_meme_sessions_status ON meme_research_sessions(status);
CREATE INDEX idx_meme_sessions_coin ON meme_research_sessions("coinName");
```

#### 2. `meme_reports`

Stores comprehensive research reports.

```sql
CREATE TABLE meme_reports (
    id VARCHAR PRIMARY KEY,                    -- Report ID (UUID)
    "sessionId" VARCHAR NOT NULL,              -- FK to meme_research_sessions
    "reportContent" JSONB NOT NULL,            -- Full research data
    summary TEXT NULL,                         -- Executive summary
    "researchDurationSeconds" INTEGER NULL,    -- Time taken
    "dataSources" JSONB NULL,                  -- Sources used
    "createdAt" TIMESTAMP(6) NOT NULL,
    "updatedAt" TIMESTAMP(6) NOT NULL,
    CONSTRAINT meme_reports_pkey PRIMARY KEY (id),
    CONSTRAINT meme_reports_sessionId_fkey 
        FOREIGN KEY ("sessionId") 
        REFERENCES meme_research_sessions(id) 
        ON DELETE CASCADE
);

-- Index
CREATE INDEX idx_meme_reports_session ON meme_reports("sessionId");
```

#### 3. `users` (Required)

Meme GPT requires users to exist. For testing, users are auto-created.

```sql
CREATE TABLE users (
    id VARCHAR PRIMARY KEY,
    username VARCHAR NULL,
    "walletAddress" VARCHAR UNIQUE NOT NULL,
    "currentPlan" "PaymentPlan" NOT NULL DEFAULT 'FREE',
    status "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL
);

CREATE TYPE "PaymentPlan" AS ENUM ('FREE', 'PAY_AS_YOU_GO', 'TOP_UP', 'SUBSCRIPTION');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'PAUSED', 'BLOCKED');
```

### MongoDB Collections

#### `checkpoints` Collection

Stores LangGraph conversation state.

```javascript
{
  "_id": ObjectId,
  "thread_id": "session-uuid-here",  // Maps to meme_research_sessions.id
  "checkpoint_ns": "",
  "checkpoint_id": "uuid",
  "parent_checkpoint_id": "uuid" | null,
  "type": "checkpoint",
  "checkpoint": {
    "v": 1,
    "id": "uuid",
    "ts": "2026-02-24T10:00:00Z",
    "channel_values": {
      "messages": [...],      // Conversation history
      "session_id": "...",
      "user_id": "...",
      "research_phase": "..."
    },
    "channel_versions": {},
    "versions_seen": {}
  },
  "metadata": {},
  "created_at": ISODate,
  "updated_at": ISODate
}
```

---

## Environment Variables

### Required Variables

```bash
# ============================================
# LLM Configuration (OpenRouter)
# ============================================
OPENROUTER_API_KEY=sk-or-v1-xxxxx        # OpenRouter API key for Grok access
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

# ============================================
# Parallel AI (Research Tasks)
# ============================================
PARALLEL_AI_API_KEY=pa_xxxxx            # Parallel AI Task API key
PARALLEL_AI_BASE_URL=https://api.parallel.ai/v1

# ============================================
# PostgreSQL Database
# ============================================
DATABASE_URL=postgresql+asyncpg://user:password@host:5432/dbname
DB_HOST=localhost
DB_PORT=5432
DB_NAME=meme_gpt_db
DB_USER=postgres
DB_PASSWORD=your_password
DB_POOL_SIZE=10
DB_MAX_OVERFLOW=20

# ============================================
# MongoDB (Checkpointing)
# ============================================
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/
MONGODB_DB_NAME=meme_gpt_checkpoints

# ============================================
# Application Settings
# ============================================
ENVIRONMENT=development                  # development | production
HOST=0.0.0.0
PORT=8000
RELOAD=true                             # Auto-reload on code changes

# ============================================
# Optional: Logging
# ============================================
LOG_LEVEL=INFO                          # DEBUG | INFO | WARNING | ERROR
```

### Model Configuration (.env or code)

```bash
# Grok Model Settings
GROK_MODEL=x-ai/grok-beta              # Grok 4.1 Fast model ID
GROK_TEMPERATURE=0.3                   # Lower = more focused
GROK_MAX_TOKENS=2000                   # Response length limit
```

---

## Agent Configuration

### MemeAgentConfig

```python
# agent/meme_agent.py

class MemeAgentConfig:
    """Configuration for Meme GPT agent"""
    
    # LLM Settings
    model_name: str = "x-ai/grok-beta"           # Grok 4.1 Fast via OpenRouter
    temperature: float = 0.3                      # Focused responses
    max_tokens: int = 2000                        # Token limit per response
    
    # Tool Settings
    max_iterations: int = 10                      # Max agent loops
    max_execution_time: float = 300.0             # 5 minutes timeout
    
    # Research Settings
    parallel_task_timeout: int = 180              # 3 minutes for research
    enable_streaming: bool = True                 # SSE streaming
    
    # Checkpointing
    enable_checkpointing: bool = True             # Save conversation state
    checkpoint_namespace: str = "meme_gpt"        # MongoDB namespace
```

### System Prompt Summary

The agent uses a 330-line expert system prompt located at:
```
agent/prompts/meme_gpt_system_prompt.py
```

**Key Instructions:**
- Identify coin mentions in natural language
- Use `research_meme_coin` tool for new coins
- Reference stored reports with `get_stored_report`
- Update stale data with `refresh_coin_data`
- Provide risk-aware recommendations
- Never give financial advice (disclaimers)
- Format responses with markdown for readability

---

## Tools & Capabilities

### Tool 1: `research_meme_coin`

**Purpose**: Conduct comprehensive research on a meme coin using Parallel AI.

**Signature**:
```python
async def research_meme_coin(
    coin_name: str,
    coin_symbol: Optional[str] = None
) -> str
```

**Parameters**:
- `coin_name` (required): Full name of the coin (e.g., "Dogecoin")
- `coin_symbol` (optional): Ticker symbol (e.g., "DOGE")

**Returns**: JSON string with research report

**Execution Flow**:
```
1. Launch 4 parallel Parallel AI tasks
2. Wait for completion (60-180s)
3. Aggregate results into structured report
4. Calculate risk score (0-100)
5. Save to PostgreSQL (meme_reports table)
6. Return formatted JSON
```

**Output Structure**:
```json
{
  "coin_name": "Dogecoin",
  "coin_symbol": "DOGE",
  "timestamp": "2026-02-24T10:00:00Z",
  "research_duration_seconds": 125,
  "price_analysis": {
    "current_price": "$0.0821",
    "24h_change": "+5.2%",
    "market_cap": "$11.8B",
    "volume_24h": "$842M",
    "ath": "$0.731",
    "ath_date": "2021-05-08",
    "key_support_levels": ["$0.075", "$0.065"],
    "key_resistance_levels": ["$0.090", "$0.105"]
  },
  "sentiment_analysis": {
    "overall_sentiment": "BULLISH",
    "sentiment_score": 72,
    "twitter_mentions_24h": 12400,
    "reddit_posts_24h": 340,
    "trending_hashtags": ["#DOGE", "#DogeToTheMoon"],
    "influencer_sentiment": "Positive (Elon Musk tweeted)"
  },
  "social_metrics": {
    "twitter_followers": 3800000,
    "reddit_subscribers": 2400000,
    "telegram_members": 185000,
    "discord_members": 52000,
    "community_activity": "High",
    "developer_activity": "Medium"
  },
  "whale_activity": {
    "top_10_holders_percentage": "42%",
    "recent_large_transactions": [
      {"amount": "50M DOGE", "direction": "accumulation", "timestamp": "2h ago"},
      {"amount": "30M DOGE", "direction": "distribution", "timestamp": "5h ago"}
    ],
    "whale_sentiment": "Neutral to Bullish"
  },
  "risk_assessment": {
    "risk_score": 58,
    "risk_level": "MEDIUM",
    "risk_factors": [
      "High volatility",
      "Centralized holder concentration",
      "Meme-driven price action"
    ],
    "strengths": [
      "Large community support",
      "Established brand recognition",
      "Active development"
    ]
  },
  "recommendation": "Moderate risk investment. Suitable for speculative portfolios with risk tolerance. Monitor whale activity closely.",
  "data_sources": ["CoinGecko", "Twitter API", "Reddit API", "Etherscan"]
}
```

---

### Tool 2: `get_stored_report`

**Purpose**: Retrieve previously generated research report.

**Signature**:
```python
async def get_stored_report(
    coin_name: str,
    session_id: str
) -> str
```

**Parameters**:
- `coin_name`: Coin to retrieve report for
- `session_id`: Current session ID

**Returns**: Full JSON report or error message

**Use Cases**:
- User asks follow-up questions
- Agent needs to reference previous research
- Avoiding redundant API calls

---

### Tool 3: `refresh_coin_data`

**Purpose**: Quick update of price and sentiment (30-60s).

**Signature**:
```python
async def refresh_coin_data(
    coin_name: str,
    coin_symbol: Optional[str] = None
) -> str
```

**Parameters**: Same as `research_meme_coin`

**Returns**: Lightweight update with current price + sentiment

**Use Cases**:
- Price check during conversation
- Sentiment update without full research
- Flash news verification

---

## API Endpoints

### Base URL
```
http://localhost:8000/meme-gpt
```

---

### 1. POST `/meme-gpt/chat`

**Description**: Main chat endpoint with streaming SSE responses.

**Request**:
```json
{
  "user_id": "user_abc123",
  "message": "Research Dogecoin for me",
  "session_id": null,           // Optional: null = auto-generate
  "coin_name": null             // Optional: hint for extraction
}
```

**Response**: Server-Sent Events (SSE) stream

**Event Types**:

```javascript
// 1. Agent Start
event: agent_start
data: {"timestamp": "2026-02-24T10:00:00Z", "session_id": "uuid", "user_id": "user_abc123"}

// 2. Agent Thinking
event: agent_thinking
data: {"content": "I'll research Dogecoin for you...", "timestamp": "..."}

// 3. Tool Calling
event: tool_calling
data: {"tool": "research_meme_coin", "args": {"coin_name": "Dogecoin"}, "timestamp": "..."}

// 4. Tool Result
event: tool_result
data: {"tool": "research_meme_coin", "result": "{...json...}", "timestamp": "..."}

// 5. Agent Message
event: agent_message
data: {"content": "Based on my research, Dogecoin shows...", "timestamp": "..."}

// 6. Agent Complete
event: agent_complete
data: {
  "timestamp": "...",
  "total_duration_seconds": 132.5,
  "ttfb_seconds": 2.1,
  "usage": {"input_tokens": 1234, "output_tokens": 567, "total_cost": 0.000051}
}

// 7. Error
event: error
data: {"error": "Tool execution failed", "timestamp": "..."}
```

**cURL Example**:
```bash
curl -X POST http://localhost:8000/meme-gpt/chat \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test_user",
    "message": "What are the risks of investing in Shiba Inu?",
    "session_id": null
  }'
```

---

### 2. POST `/meme-gpt/sessions/history`

**Description**: Retrieve conversation history for a session.

**Request**:
```json
{
  "session_id": "uuid-here",
  "limit": 50                   // Default: 50
}
```

**Response**:
```json
{
  "session_id": "uuid-here",
  "messages": [
    {
      "role": "human",
      "content": "Research Dogecoin",
      "timestamp": "2026-02-24T10:00:00Z"
    },
    {
      "role": "ai",
      "content": "Based on my research, Dogecoin...",
      "timestamp": "2026-02-24T10:02:15Z",
      "tool_calls": ["research_meme_coin"]
    },
    {
      "role": "human",
      "content": "What are the main risks?",
      "timestamp": "2026-02-24T10:03:00Z"
    }
  ],
  "total_messages": 3
}
```

---

### 3. POST `/meme-gpt/sessions/report`

**Description**: Get full research report for a session.

**Request**:
```json
{
  "session_id": "uuid-here"
}
```

**Response**:
```json
{
  "session_id": "uuid-here",
  "report": {
    "coin_name": "Dogecoin",
    "coin_symbol": "DOGE",
    "price_analysis": {...},
    "sentiment_analysis": {...},
    "social_metrics": {...},
    "whale_activity": {...},
    "risk_assessment": {...}
  },
  "created_at": "2026-02-24T10:02:10Z",
  "research_duration_seconds": 125
}
```

---

### 4. GET `/meme-gpt/sessions/user/{user_id}`

**Description**: List all sessions for a user.

**Response**:
```json
{
  "user_id": "user_abc123",
  "sessions": [
    {
      "id": "uuid-1",
      "coin_name": "Dogecoin",
      "status": "COMPLETED",
      "created_at": "2026-02-24T10:00:00Z",
      "last_active": "2026-02-24T10:05:00Z"
    },
    {
      "id": "uuid-2",
      "coin_name": "Shiba Inu",
      "status": "ACTIVE",
      "created_at": "2026-02-24T11:00:00Z",
      "last_active": "2026-02-24T11:02:00Z"
    }
  ],
  "total_sessions": 2
}
```

---

## Agent Workflow

### Phase 1: Request Processing (0-2s)

```
1. Receive user message
2. Auto-create user if doesn't exist
3. Generate/retrieve session_id
4. Create/update meme_research_sessions record
5. Initialize LangGraph agent with checkpointing
```

### Phase 2: Intent Detection (2-5s)

```
Agent analyzes message:
- "Research X" → Trigger research_meme_coin
- "What about Y?" → Trigger get_stored_report
- "Current price?" → Trigger refresh_coin_data
- General question → Answer from context
```

### Phase 3: Tool Execution (5-180s)

```
If research_meme_coin called:
  ├─ Launch Parallel AI tasks (concurrent)
  │  ├─ Task 1: Price Analysis (45-60s)
  │  ├─ Task 2: Sentiment (60-90s)
  │  ├─ Task 3: Social Metrics (30-45s)
  │  └─ Task 4: Whale Activity (45-75s)
  │
  ├─ Poll for completion (every 5s)
  ├─ Aggregate results
  ├─ Calculate risk score
  └─ Save to PostgreSQL

If get_stored_report called:
  └─ Query meme_reports table (200-500ms)

If refresh_coin_data called:
  └─ Quick Parallel AI update (30-60s)
```

### Phase 4: Response Generation (180-185s)

```
1. Agent receives tool results
2. Formats response with markdown
3. Includes risk disclaimers
4. Streams to client via SSE
5. Saves checkpoint to MongoDB
```

### Phase 5: Follow-up Handling (5-10s)

```
User asks: "What are the risks?"

Agent workflow:
1. Check context (has research been done?)
2. Call get_stored_report (200ms)
3. Extract risk_assessment section
4. Format detailed risk analysis
5. Stream response
```

---

## Integration Guide (NestJS/Mastra)

### Mastra Framework Overview

Mastra is a TypeScript framework for building AI agents. Here's how to implement Meme GPT:

### 1. Install Dependencies

```bash
npm install @mastra/core @mastra/openrouter axios
```

### 2. Define Tools

```typescript
// src/agents/meme-gpt/tools.ts

import { Tool } from '@mastra/core';
import axios from 'axios';

export const researchMemeCoin = new Tool({
  id: 'research_meme_coin',
  description: 'Research a meme coin using Parallel AI for comprehensive analysis',
  parameters: {
    type: 'object',
    properties: {
      coin_name: {
        type: 'string',
        description: 'Full name of the meme coin',
      },
      coin_symbol: {
        type: 'string',
        description: 'Optional ticker symbol (e.g., DOGE)',
      },
    },
    required: ['coin_name'],
  },
  execute: async ({ coin_name, coin_symbol }) => {
    // Call Parallel AI Service
    const parallelAIService = new ParallelAIService(process.env.PARALLEL_AI_API_KEY);
    
    const report = await parallelAIService.researchCoin({
      coinName: coin_name,
      coinSymbol: coin_symbol,
    });
    
    // Save to database
    await prisma.memeReport.create({
      data: {
        sessionId: /* from context */,
        reportContent: report,
        summary: generateSummary(report),
        researchDurationSeconds: report.research_duration_seconds,
      },
    });
    
    return JSON.stringify(report);
  },
});

export const getStoredReport = new Tool({
  id: 'get_stored_report',
  description: 'Retrieve previously generated research report',
  parameters: {
    type: 'object',
    properties: {
      coin_name: { type: 'string' },
      session_id: { type: 'string' },
    },
    required: ['coin_name', 'session_id'],
  },
  execute: async ({ coin_name, session_id }) => {
    const report = await prisma.memeReport.findFirst({
      where: {
        sessionId: session_id,
        reportContent: {
          path: ['coin_name'],
          equals: coin_name,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    
    return report ? JSON.stringify(report.reportContent) : 'No report found';
  },
});

export const refreshCoinData = new Tool({
  id: 'refresh_coin_data',
  description: 'Quick update of price and sentiment',
  parameters: {
    type: 'object',
    properties: {
      coin_name: { type: 'string' },
      coin_symbol: { type: 'string' },
    },
    required: ['coin_name'],
  },
  execute: async ({ coin_name, coin_symbol }) => {
    // Quick update logic (similar to research but faster)
    const quickUpdate = await parallelAIService.quickUpdate({
      coinName: coin_name,
      coinSymbol: coin_symbol,
    });
    
    return JSON.stringify(quickUpdate);
  },
});
```

### 3. Create Parallel AI Service

```typescript
// src/services/parallel-ai.service.ts

import axios from 'axios';

export class ParallelAIService {
  private apiKey: string;
  private baseUrl = 'https://api.parallel.ai/v1';
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  async researchCoin(params: { coinName: string; coinSymbol?: string }) {
    // 1. Launch 4 concurrent tasks
    const tasks = await Promise.all([
      this.launchTask('price_analysis', params),
      this.launchTask('sentiment_analysis', params),
      this.launchTask('social_metrics', params),
      this.launchTask('whale_activity', params),
    ]);
    
    // 2. Wait for completion
    const results = await this.waitForTasks(tasks.map(t => t.task_id));
    
    // 3. Aggregate results
    return this.aggregateResults(results, params);
  }
  
  private async launchTask(taskType: string, params: any) {
    const response = await axios.post(
      `${this.baseUrl}/tasks`,
      {
        task_type: taskType,
        parameters: params,
      },
      {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      }
    );
    
    return response.data;
  }
  
  private async waitForTasks(taskIds: string[], maxWait = 180000) {
    const startTime = Date.now();
    const results = [];
    
    while (Date.now() - startTime < maxWait) {
      for (const taskId of taskIds) {
        const status = await this.checkTaskStatus(taskId);
        
        if (status.state === 'completed') {
          results.push(status.result);
          taskIds = taskIds.filter(id => id !== taskId);
        } else if (status.state === 'failed') {
          throw new Error(`Task ${taskId} failed: ${status.error}`);
        }
      }
      
      if (taskIds.length === 0) break;
      
      await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5s
    }
    
    if (taskIds.length > 0) {
      throw new Error('Tasks timed out');
    }
    
    return results;
  }
  
  private async checkTaskStatus(taskId: string) {
    const response = await axios.get(
      `${this.baseUrl}/tasks/${taskId}`,
      {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      }
    );
    
    return response.data;
  }
  
  private aggregateResults(results: any[], params: any) {
    const [priceData, sentimentData, socialData, whaleData] = results;
    
    const riskScore = this.calculateRiskScore({
      priceData,
      sentimentData,
      socialData,
      whaleData,
    });
    
    return {
      coin_name: params.coinName,
      coin_symbol: params.coinSymbol,
      timestamp: new Date().toISOString(),
      research_duration_seconds: Math.floor((Date.now() - startTime) / 1000),
      price_analysis: priceData,
      sentiment_analysis: sentimentData,
      social_metrics: socialData,
      whale_activity: whaleData,
      risk_assessment: {
        risk_score: riskScore,
        risk_level: this.getRiskLevel(riskScore),
        ...this.generateRiskFactors({ priceData, sentimentData, socialData, whaleData }),
      },
      recommendation: this.generateRecommendation(riskScore),
    };
  }
  
  private calculateRiskScore(data: any): number {
    // Risk scoring algorithm (0-100)
    let score = 50; // Base score
    
    // Volatility impact
    if (data.priceData.volatility_24h > 20) score += 15;
    
    // Sentiment impact
    if (data.sentimentData.sentiment_score < 40) score += 10;
    if (data.sentimentData.sentiment_score > 70) score -= 5;
    
    // Whale concentration
    const whalePercentage = parseInt(data.whaleData.top_10_holders_percentage);
    if (whalePercentage > 50) score += 10;
    
    // Community strength
    if (data.socialData.community_activity === 'High') score -= 5;
    
    return Math.max(0, Math.min(100, score));
  }
  
  private getRiskLevel(score: number): string {
    if (score < 30) return 'LOW';
    if (score < 60) return 'MEDIUM';
    return 'HIGH';
  }
}
```

### 4. Define Meme GPT Agent

```typescript
// src/agents/meme-gpt/agent.ts

import { Agent } from '@mastra/core';
import { OpenRouterProvider } from '@mastra/openrouter';
import { researchMemeCoin, getStoredReport, refreshCoinData } from './tools';
import { systemPrompt } from './prompts';

export const memeGPTAgent = new Agent({
  id: 'meme-gpt',
  name: 'Meme GPT',
  description: 'AI-powered meme coin research agent',
  
  model: new OpenRouterProvider({
    apiKey: process.env.OPENROUTER_API_KEY,
    model: 'x-ai/grok-beta', // Grok 4.1 Fast
    temperature: 0.3,
    maxTokens: 2000,
  }),
  
  tools: [researchMemeCoin, getStoredReport, refreshCoinData],
  
  systemPrompt: systemPrompt,
  
  memory: {
    enabled: true,
    provider: 'mongodb', // Use MongoDB for checkpointing
    config: {
      uri: process.env.MONGODB_URI,
      database: 'meme_gpt_checkpoints',
      collection: 'checkpoints',
    },
  },
  
  maxIterations: 10,
  timeout: 300000, // 5 minutes
});
```

### 5. System Prompt (TypeScript)

```typescript
// src/agents/meme-gpt/prompts.ts

export const systemPrompt = `You are Meme GPT, an expert cryptocurrency analyst specializing in meme coins.

## YOUR ROLE
You research meme coins and provide comprehensive, data-driven analysis to help users make informed decisions.

## CAPABILITIES
You have access to 3 tools:

1. **research_meme_coin(coin_name, coin_symbol?)**: Conducts deep research (60-180s)
   - Price & market analysis
   - Sentiment analysis (Twitter/Reddit)
   - Social metrics
   - Whale activity
   - Returns comprehensive JSON report

2. **get_stored_report(coin_name, session_id)**: Retrieves previous research
   - Use for follow-up questions
   - Avoids redundant API calls

3. **refresh_coin_data(coin_name, coin_symbol?)**: Quick update (30-60s)
   - Current price check
   - Latest sentiment

## WORKFLOW

### When user mentions a NEW coin:
1. Extract coin name from message
2. Call research_meme_coin(coin_name)
3. Wait for results (show "Researching..." status)
4. Present key findings with markdown formatting
5. Include risk disclaimer

### When user asks FOLLOW-UP questions:
1. Call get_stored_report(coin_name, session_id)
2. Extract relevant section (price/sentiment/risks)
3. Answer question with context
4. No need to re-research

### When user asks for PRICE UPDATE:
1. Call refresh_coin_data(coin_name)
2. Show current price + sentiment
3. Note changes since last research

## RESPONSE FORMAT

### Research Summary Template:
\`\`\`
# 🪙 [Coin Name] ([SYMBOL]) Research Report

## 📊 Market Overview
- **Current Price**: $X.XX (+/-Y%)
- **Market Cap**: $XXM
- **24h Volume**: $XXM

## 💭 Sentiment Analysis
- **Overall Sentiment**: BULLISH/NEUTRAL/BEARISH (Score: X/100)
- **Twitter Mentions**: X,XXX
- **Community Activity**: High/Medium/Low

## ⚠️ Risk Assessment
- **Risk Level**: LOW/MEDIUM/HIGH (Score: X/100)
- **Key Risks**: [List 3-5 main concerns]
- **Strengths**: [List 3-5 positive factors]

## 🎯 Recommendation
[Your analysis and recommendation]

---
⚠️ **Disclaimer**: This is not financial advice. Always do your own research and invest responsibly.
\`\`\`

## IMPORTANT RULES
1. ✅ ALWAYS include risk disclaimers
2. ✅ Use markdown for readability
3. ✅ Cite data sources
4. ✅ Be honest about limitations
5. ❌ NEVER guarantee profits
6. ❌ NEVER encourage FOMO
7. ❌ NEVER ignore red flags

## RESPONSE STYLE
- Professional yet approachable
- Data-driven, not hype-driven
- Risk-aware and balanced
- Educational and informative

Start analyzing!`;
```

### 6. NestJS Controller

```typescript
// src/controllers/meme-gpt.controller.ts

import { Controller, Post, Get, Body, Param, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { MemeGPTService } from '../services/meme-gpt.service';

@Controller('meme-gpt')
export class MemeGPTController {
  constructor(private readonly memeGPTService: MemeGPTService) {}
  
  @Post('chat')
  @Sse()
  async chat(
    @Body() body: { user_id: string; message: string; session_id?: string }
  ): Promise<Observable<any>> {
    return this.memeGPTService.streamChat(body);
  }
  
  @Post('sessions/history')
  async getHistory(@Body() body: { session_id: string; limit?: number }) {
    return this.memeGPTService.getHistory(body.session_id, body.limit);
  }
  
  @Post('sessions/report')
  async getReport(@Body() body: { session_id: string }) {
    return this.memeGPTService.getReport(body.session_id);
  }
  
  @Get('sessions/user/:userId')
  async getUserSessions(@Param('userId') userId: string) {
    return this.memeGPTService.getUserSessions(userId);
  }
}
```

### 7. NestJS Service

```typescript
// src/services/meme-gpt.service.ts

import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { memeGPTAgent } from '../agents/meme-gpt/agent';
import { PrismaService } from './prisma.service';

@Injectable()
export class MemeGPTService {
  constructor(private readonly prisma: PrismaService) {}
  
  async streamChat(params: {
    user_id: string;
    message: string;
    session_id?: string;
  }): Promise<Observable<any>> {
    // Auto-create user if needed
    await this.ensureUserExists(params.user_id);
    
    // Generate or retrieve session
    const sessionId = params.session_id || this.generateUUID();
    
    // Create/update session record
    await this.upsertSession(sessionId, params.user_id);
    
    // Stream agent response
    return new Observable((observer) => {
      memeGPTAgent
        .stream(params.message, {
          sessionId,
          userId: params.user_id,
        })
        .subscribe({
          next: (chunk) => observer.next(this.formatSSE(chunk)),
          error: (err) => observer.error(err),
          complete: () => observer.complete(),
        });
    });
  }
  
  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    
    if (!user) {
      await this.prisma.user.create({
        data: {
          id: userId,
          username: `user_${userId.substring(0, 8)}`,
          walletAddress: `0x${userId}`,
          currentPlan: 'FREE',
          status: 'ACTIVE',
        },
      });
    }
  }
  
  private formatSSE(chunk: any) {
    return {
      type: chunk.type,
      data: chunk.data,
    };
  }
  
  // ... other methods
}
```

---

## Testing & Examples

### Test Scenario 1: First-time Research

**Request**:
```json
{
  "user_id": "test_123",
  "message": "Research Dogecoin",
  "session_id": null
}
```

**Expected Flow**:
1. User created automatically
2. Session generated
3. Agent calls `research_meme_coin("Dogecoin")`
4. 4 parallel tasks launched
5. Wait 60-180 seconds
6. Report saved to database
7. Stream summary to user

**Expected Response** (SSE events):
```
event: agent_start
data: {"session_id": "abc-123", ...}

event: agent_thinking
data: {"content": "I'll research Dogecoin for you..."}

event: tool_calling
data: {"tool": "research_meme_coin", "args": {"coin_name": "Dogecoin"}}

... [60-180s wait] ...

event: tool_result
data: {"tool": "research_meme_coin", "result": "{...}"}

event: agent_message
data: {"content": "# 🪙 Dogecoin (DOGE) Research Report\n\n..."}

event: agent_complete
data: {"total_duration_seconds": 125}
```

---

### Test Scenario 2: Follow-up Questions

**Request 1**:
```json
{
  "user_id": "test_123",
  "message": "Research Shiba Inu",
  "session_id": null
}
```

**Request 2** (same session):
```json
{
  "user_id": "test_123",
  "message": "What are the main risks?",
  "session_id": "abc-123"  // Use same session
}
```

**Expected Flow for Request 2**:
1. Agent recognizes follow-up question
2. Calls `get_stored_report("Shiba Inu", "abc-123")`
3. Extracts risk_assessment section
4. Formats detailed risk analysis
5. Streams response (5-10s total)

---

### Test Scenario 3: Price Update

**Request**:
```json
{
  "user_id": "test_123",
  "message": "What's the current price of Dogecoin?",
  "session_id": "abc-123"
}
```

**Expected Flow**:
1. Agent calls `refresh_coin_data("Dogecoin")`
2. Quick update (30-60s)
3. Returns current price + sentiment

---

## Error Handling

### Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `User does not exist` | User not in database | Auto-create user enabled by default |
| `Parallel AI timeout` | Tasks taking >180s | Retry with exponential backoff |
| `MongoDB connection failed` | Invalid URI | Check MONGODB_URI env var |
| `PostgreSQL error` | Enum mismatch | Ensure PaymentPlan, UserStatus enums exist |
| `Tool execution failed` | API key invalid | Verify PARALLEL_AI_API_KEY |
| `Rate limit exceeded` | Too many requests | Implement rate limiting (10 req/min) |

### Error Response Format

```json
{
  "error": "Tool execution failed",
  "details": "Parallel AI API returned 429 Too Many Requests",
  "timestamp": "2026-02-24T10:00:00Z",
  "session_id": "abc-123"
}
```

---

## Performance & Optimization

### Benchmarks

| Operation | Avg Time | P95 Time |
|-----------|----------|----------|
| User creation | 200ms | 500ms |
| Session creation | 150ms | 300ms |
| Full research | 125s | 180s |
| Get stored report | 250ms | 500ms |
| Quick update | 45s | 60s |
| TTFB (first response) | 2s | 5s |

### Optimization Tips

1. **Database Pooling**:
```typescript
// Prisma connection pooling
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  connection_limit = 20
}
```

2. **Caching Reports**:
```typescript
// Cache reports for 5 minutes
const cachedReport = await redis.get(`report:${coinName}`);
if (cachedReport) return JSON.parse(cachedReport);

// ... fetch and cache
await redis.setex(`report:${coinName}`, 300, JSON.stringify(report));
```

3. **Parallel Task Optimization**:
```typescript
// Timeout for individual tasks
const taskPromises = tasks.map(async (task) => {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Task timeout')), 60000)
  );
  
  return Promise.race([task.execute(), timeoutPromise]);
});
```

4. **Rate Limiting**:
```typescript
@RateLimit({ ttl: 60, limit: 10 }) // 10 requests per minute
async chat() { ... }
```

---

## Production Checklist

### Before Deployment

- [ ] Set `ENVIRONMENT=production` in .env
- [ ] Configure PostgreSQL connection pooling (min: 5, max: 20)
- [ ] Enable MongoDB replica set for high availability
- [ ] Set up error monitoring (Sentry, DataDog)
- [ ] Implement rate limiting (10 req/min per user)
- [ ] Add Redis caching for reports (5-min TTL)
- [ ] Configure CORS for specific domains
- [ ] Set up API key rotation schedule
- [ ] Enable SSL/TLS for database connections
- [ ] Implement logging aggregation (ELK stack)
- [ ] Set up health check endpoints
- [ ] Configure auto-scaling (CPU > 70% → scale up)
- [ ] Test disaster recovery procedures
- [ ] Document runbook for common issues

### Monitoring Metrics

```typescript
// Key metrics to track
- Request rate (req/s)
- Average research time (seconds)
- Tool success rate (%)
- Database connection pool usage (%)
- MongoDB checkpoint size (MB)
- Error rate (errors/min)
- TTFB (Time To First Byte)
- User session duration (minutes)
```

---

## Support & Resources

### Documentation Links

- [Parallel AI Task API Docs](https://docs.parallel.ai)
- [OpenRouter Grok Models](https://openrouter.ai/models)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [Mastra Framework](https://mastra.dev)

### Example Repositories

- Python Implementation: `gen-world-game-generation-python/`
- NestJS Template: (Create from this guide)

### Common Questions

**Q: How much does it cost per research?**
A: ~$0.05-0.10 per full research (Parallel AI + Grok tokens)

**Q: Can I use a different LLM?**
A: Yes, replace OpenRouterProvider with any LangChain-compatible model

**Q: How do I handle multiple concurrent requests?**
A: Use database connection pooling and async/await properly

**Q: Can I customize the risk scoring algorithm?**
A: Yes, modify `calculateRiskScore()` in ParallelAIService

---

## Conclusion

You now have everything needed to implement Meme GPT in your NestJS backend with Mastra:

✅ Complete architecture understanding
✅ Database schema (Prisma-ready)
✅ Tool implementations
✅ Agent configuration
✅ API endpoints specification
✅ Error handling strategies
✅ Performance optimization tips
✅ Production deployment checklist

**Next Steps:**
1. Set up environment variables
2. Create Prisma schema for PostgreSQL tables
3. Implement ParallelAIService
4. Define Mastra agent with tools
5. Create NestJS controller + service
6. Test with example requests
7. Deploy to production

Good luck building! 🚀
