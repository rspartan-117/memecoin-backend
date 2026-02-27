# Meme GPT - Final Setup Steps

This guide walks through the remaining steps to complete the Meme GPT Agent implementation.

## ✅ Already Completed

The following has been implemented:

1. ✅ Database schema (3 models + 2 enums)
2. ✅ Parallel AI service (400+ lines)
3. ✅ OpenRouter service (Grok integration)
4. ✅ All 3 tools (research, get_stored, refresh)
5. ✅ Memory store (PostgreSQL-backed)
6. ✅ NestJS module, service, controller
7. ✅ Module registered in app.module.ts

## 🔧 Steps to Complete Setup

### Step 1: Install Dependencies

```bash
# Install uuid library for session ID generation
npm install uuid

# Install type definitions
npm install --save-dev @types/uuid
```

### Step 2: Add Environment Variables

Create or update your `.env` file with:

```bash
# ============================
# MEME GPT CONFIGURATION
# ============================

# Parallel AI Task API
# Sign up at: https://parallellabs.ai
PARALLEL_AI_API_KEY=your_parallel_ai_api_key_here
PARALLEL_AI_BASE_URL=https://api.parallellabs.ai/v1

# OpenRouter API (Grok 4.1 Fast)
# Sign up at: https://openrouter.ai
OPENROUTER_API_KEY=sk-or-v1-your_key_here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
GROK_MODEL=x-ai/grok-beta

# Your application domain (for OpenRouter referrer header)
SELF_DOMAIN=http://localhost:4000
```

**How to get API keys**:

1. **Parallel AI**:
   - Visit https://parallellabs.ai
   - Sign up for an account
   - Navigate to API keys section
   - Create new API key
   - Choose Lite or Base tier (you mentioned you have both)

2. **OpenRouter**:
   - Visit https://openrouter.ai
   - Sign up/login
   - Go to Keys section
   - Create new API key
   - Copy the `sk-or-v1-...` key

### Step 3: Run Database Migration

```bash
# Generate Prisma migration for new tables
npx prisma migrate dev --name add_meme_gpt_tables

# Regenerate Prisma Client
npx prisma generate
```

This will create:
- `MemeResearchSession` table
- `MemeReport` table
- `MemeConversation` table
- `MemeSessionStatus` enum
- `MemeResearchStatus` enum

### Step 4: Build and Start Server

```bash
# Development mode with hot reload
npm run start:dev

# OR production build
npm run build
npm run start:prod
```

### Step 5: Verify Installation

**Test 1: Health Check**

```bash
curl http://localhost:4000/meme-gpt/health
```

Expected response:
```json
{
  "status": "ok",
  "module": "Meme GPT",
  "version": "1.0.0",
  "timestamp": "2025-01-20T12:34:56.789Z"
}
```

**Test 2: Get JWT Token**

```bash
# Login to get JWT token (use existing auth endpoint)
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your_test_user@example.com",
    "password": "your_password"
  }'
```

Copy the JWT token from the response.

**Test 3: Chat with Meme GPT**

```bash
# Replace YOUR_JWT_TOKEN with actual token
curl -X POST http://localhost:4000/meme-gpt/chat \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What can you help me with?",
    "coinName": "General"
  }'
```

Expected response:
```json
{
  "sessionId": "uuid-v4-here",
  "response": "I'm Meme GPT, your AI research assistant specializing in meme coin analysis...",
  "timestamp": "2025-01-20T12:34:56.789Z"
}
```

**Test 4: Request Research**

```bash
curl -X POST http://localhost:4000/meme-gpt/chat \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Research Dogecoin for me",
    "sessionId": "uuid-from-previous-response"
  }'
```

This will:
1. Check for cached report
2. If none found, trigger `research_meme_coin` tool
3. Launch 4 parallel Parallel AI tasks
4. Wait 60-180 seconds for completion
5. Return comprehensive analysis

## 🧪 Testing Each Component

### Test Parallel AI Service

Create a test script `test-parallel-ai.ts`:

```typescript
import { ParallelAIService } from './src/mastra/services/parallel-ai.service';
import { ConfigService } from '@nestjs/config';

const configService = {
  getOrThrow: (key: string) => {
    const config = {
      PARALLEL_AI_API_KEY: 'your_key',
      PARALLEL_AI_BASE_URL: 'https://api.parallellabs.ai/v1',
    };
    return config[key];
  },
} as ConfigService;

const service = new ParallelAIService(configService);

async function test() {
  console.log('Starting research...');
  const result = await service.researchCoin('DOGE', true, true);
  console.log('Result:', JSON.stringify(result, null, 2));
}

test();
```

Run:
```bash
npx ts-node test-parallel-ai.ts
```

### Test OpenRouter Service

Create `test-openrouter.ts`:

```typescript
import { OpenRouterService } from './src/mastra/services/openrouter.service';
import { ConfigService } from '@nestjs/config';

const configService = {
  getOrThrow: (key: string) => {
    const config = {
      OPENROUTER_API_KEY: 'sk-or-v1-your_key',
      OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
      GROK_MODEL: 'x-ai/grok-beta',
      SELF_DOMAIN: 'http://localhost:4000',
    };
    return config[key];
  },
  get: (key: string) => configService.getOrThrow(key),
} as ConfigService;

const service = new OpenRouterService(configService);

async function test() {
  const response = await service.chat({
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello! What can you do?' },
    ],
    temperature: 0.3,
    maxTokens: 200,
  });
  
  console.log('Response:', response.choices[0].message.content);
}

test();
```

Run:
```bash
npx ts-node test-openrouter.ts
```

## 📊 Database Verification

After running migration, verify tables created:

```bash
# Access Prisma Studio
npx prisma studio
```

Check for these tables:
- `MemeResearchSession`
- `MemeReport`
- `MemeConversation`

## 🐛 Common Issues & Solutions

### Issue: "Cannot find module 'uuid'"

**Solution**:
```bash
npm install uuid
npm install --save-dev @types/uuid
```

### Issue: "PARALLEL_AI_API_KEY not found"

**Solution**:
- Check `.env` file exists in project root
- Verify variable name matches exactly
- Restart server after adding variables

### Issue: "Prisma Client not generated"

**Solution**:
```bash
npx prisma generate
```

### Issue: Database connection error

**Solution**:
- Check `DATABASE_URL` in `.env`
- Verify PostgreSQL is running
- Test connection:
  ```bash
  npx prisma db pull
  ```

### Issue: JWT authentication fails

**Solution**:
- Verify JWT token is valid (not expired)
- Check `Authorization: Bearer <token>` format
- Ensure token in header (not body)

### Issue: Parallel AI timeout

**Solution**:
- Increase timeout in `parallel-ai.service.ts`:
  ```typescript
  const maxWaitTime = 300000; // 5 minutes instead of 3
  ```

## 📝 Next Steps After Setup

1. **Seed Test Data**:
   ```bash
   npx prisma db seed
   ```

2. **Monitor Logs**:
   - Watch for Parallel AI task launches
   - Check OpenRouter API calls
   - Monitor database queries

3. **Set Up Monitoring**:
   - API usage tracking (OpenRouter dashboard)
   - Task consumption (Parallel AI dashboard)
   - Error alerts (Sentry, LogRocket, etc.)

4. **Optimize Performance**:
   - Add Redis caching for reports
   - Implement background job processing
   - Set up database indexes

5. **Production Deployment**:
   - Set production API keys
   - Configure rate limits
   - Enable CORS for frontend
   - Add request logging

## 🔄 Development Workflow

**Making changes**:

1. Edit code
2. Server auto-reloads (in dev mode)
3. Test with curl or Postman
4. Check logs for errors
5. Verify database changes in Prisma Studio

**Adding new tools**:

1. Create tool file in `src/mastra/tools/`
2. Implement factory function (accepts services)
3. Export from `tools/index.ts`
4. Add to `MemeGptService.tools` array
5. Test with chat request

**Updating prompts**:

1. Edit `agents/meme-gpt.agent.ts`
2. Modify `SYSTEM_PROMPT` constant
3. Restart server
4. Test with new instructions

## 📚 Additional Resources

- [NestJS Documentation](https://docs.nestjs.com)
- [Prisma ORM Guide](https://www.prisma.io/docs)
- [Parallel AI API Docs](https://parallellabs.ai/docs)
- [OpenRouter API Reference](https://openrouter.ai/docs)
- [Grok Model Pricing](https://openrouter.ai/models/x-ai/grok-beta)

## ✅ Checklist

Before going to production:

- [ ] Install uuid dependencies
- [ ] Add all environment variables
- [ ] Run Prisma migration
- [ ] Test health endpoint
- [ ] Test chat endpoint with JWT
- [ ] Verify Parallel AI integration
- [ ] Verify OpenRouter integration
- [ ] Test full research flow
- [ ] Test cached report retrieval
- [ ] Test quick refresh
- [ ] Set up error monitoring
- [ ] Configure production API keys
- [ ] Enable rate limiting
- [ ] Add logging/analytics
- [ ] Document API for frontend team

## 🎉 You're Done!

Once all steps are completed, the Meme GPT Agent is fully operational and ready to perform deep-dive meme coin research for your users.

---

**Questions or Issues?**

Refer to:
- `README-COMPLETE.md` for comprehensive documentation
- `MEME_GPT_AGENT_DOCUMENTATION.md` for original specification
- Logs in terminal for debugging info
