# Mastra - Meme GPT Agent

AI-powered meme coin research agent using Mastra framework.

## 📁 Structure

```
src/mastra/
├── index.ts                          # Main exports
├── memoryStore.ts                    # Conversation state persistence
├── agents/
│   └── meme-gpt.agent.ts            # Meme GPT agent configuration
└── tools/
    ├── index.ts                      # Tool exports
    ├── research-meme-coin.tool.ts   # Full research (60-180s)
    ├── get-stored-report.tool.ts    # Retrieve cached reports
    └── refresh-coin-data.tool.ts    # Quick price/sentiment update
```

## ✅ Current Status

**Barebone structure created** - Ready for implementation

### Created Files:
- ✅ `index.ts` - Main entry point
- ✅ `memoryStore.ts` - Memory store class (placeholder)
- ✅ `agents/meme-gpt.agent.ts` - Agent config + system prompt
- ✅ `tools/index.ts` - Tool exports
- ✅ `tools/research-meme-coin.tool.ts` - Research tool (placeholder)
- ✅ `tools/get-stored-report.tool.ts` - Report retrieval (placeholder)
- ✅ `tools/refresh-coin-data.tool.ts` - Quick update (placeholder)

## 🚧 TODO: Implementation Steps

### 1. Install Dependencies
```bash
npm install @mastra/core @mastra/openrouter axios
```

### 2. Set Environment Variables
```env
OPENROUTER_API_KEY=sk-or-v1-xxxxx
PARALLEL_AI_API_KEY=pa_xxxxx
```

### 3. Implement Memory Store
- [ ] Connect to MongoDB/PostgreSQL
- [ ] Implement save/get/clear methods
- [ ] Add checkpointing logic

### 4. Implement Tools
- [ ] `research-meme-coin.tool.ts`: Parallel AI integration
- [ ] `get-stored-report.tool.ts`: Database queries
- [ ] `refresh-coin-data.tool.ts`: Quick API calls

### 5. Initialize Agent
- [ ] Configure Mastra agent instance
- [ ] Wire up tools
- [ ] Add streaming support

### 6. Create NestJS Module
- [ ] Create `MemeGptModule`
- [ ] Create `MemeGptController` (HTTP + SSE endpoints)
- [ ] Create `MemeGptService` (business logic)

## 🔗 Integration Points

### Database Tables (Already in Prisma schema):
- `meme_research_sessions`
- `meme_reports`
- `users`

### External APIs Required:
- OpenRouter (Grok 4.1 Fast)
- Parallel AI Task API

## 📝 Notes

All files contain TODO comments marking where actual implementation is needed.
System prompt and tool configurations are already in place.
