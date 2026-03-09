/**
 * Meme GPT Service
 * Core business logic for meme coin research agent
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../shared/services/prisma.service';
import { SentimentAnalysisService } from './services/sentiment-analysis.service';
import {
  OpenRouterService,
  OpenRouterMessage,
} from './services/openrouter.service';
import { MemeGPTMemoryStore } from './memoryStore';
import {
  createResearchMemeCoinTool,
  createGetStoredReportTool,
  createRefreshCoinDataTool,
  createWebSearchTool,
} from './tools';
import { SYSTEM_PROMPT } from './agents/meme-gpt.agent';
import {
  CreditService,
  InsufficientCreditsError,
  MEMEGPT_MIN_CREDITS,
  MEMEGPT_RESEARCH_CREDIT_COST,
  MEMEGPT_REFRESH_CREDIT_COST,
  MEMEGPT_STORED_REPORT_CREDIT_COST,
  MEMEGPT_WEB_SEARCH_CREDIT_COST,
} from '../projects/services/credit.service';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamChunk {
  type: 'session' | 'token' | 'tool_call' | 'tool_result' | 'done' | 'error';
  data: any;
}

/**
 * In-memory state kept for every active (or recently-completed) stream.
 * Allows the history endpoint to expose partial progress so the
 * frontend can resume sessions seamlessly.
 */
export interface StreamingState {
  status: 'streaming' | 'idle';
  partialResponse: string;
  tokenCount: number;
  startedAt: Date;
  lastEventAt: Date;
  userMessage: string;
}

/** Timeout (ms) after which a completed streaming state is garbage-collected. */
const STREAMING_STATE_TTL = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class MemeGptService {
  private readonly logger = new Logger(MemeGptService.name);
  private readonly memoryStore: MemeGPTMemoryStore;
  private readonly tools: any[];

  /**
   * In-memory map tracking every session's streaming state.
   * Key = sessionId, Value = StreamingState.
   */
  private readonly streamingStates = new Map<string, StreamingState>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly sentimentAnalysis: SentimentAnalysisService,
    private readonly openRouter: OpenRouterService,
    private readonly creditService: CreditService,
  ) {
    this.memoryStore = new MemeGPTMemoryStore(prisma);

    // Initialize tools with service dependencies
    this.tools = [
      createResearchMemeCoinTool(sentimentAnalysis, prisma),
      createGetStoredReportTool(prisma),
      createRefreshCoinDataTool(sentimentAnalysis),
      createWebSearchTool(config.get<string>('PARALLEL_AI_API_KEY') || ''),
    ];
  }

  /**
   * Get an existing session or transparently create a new one.
   * The frontend always passes a sessionId — if we find it in the DB we
   * continue; otherwise we create a fresh row with that exact ID so the
   * client can keep using the same identifier.
   */
  async getOrCreateSession(
    sessionId: string,
    userId: string,
    coinName?: string,
  ): Promise<{ sessionId: string; isNew: boolean }> {
    const existing = await this.prisma.memeResearchSession.findUnique({
      where: { id: sessionId },
    });

    if (existing) {
      // Touch lastActive so the session stays near the top of the list
      await this.prisma.memeResearchSession.update({
        where: { id: sessionId },
        data: { lastActive: new Date() },
      });
      this.logger.log(`Resuming existing session ${sessionId}`);
      return { sessionId, isNew: false };
    }

    // Session doesn't exist – create one using the provided ID
    await this.prisma.memeResearchSession.create({
      data: {
        id: sessionId,
        userId,
        coinName: coinName || 'General',
        status: 'ACTIVE',
        metadata: {},
      },
    });

    this.logger.log(
      `Created new session ${sessionId} for user ${userId} (coin: ${coinName || 'General'})`,
    );
    return { sessionId, isNew: true };
  }

  // ---------------------------------------------------------------
  // Streaming-state helpers (used by the history endpoint for resume)
  // ---------------------------------------------------------------

  /** Returns the current streaming state for a session (if any). */
  getStreamingState(sessionId: string): StreamingState | undefined {
    return this.streamingStates.get(sessionId);
  }

  /**
   * Schedule cleanup of a completed streaming state so we don't leak memory.
   * The state lingers for STREAMING_STATE_TTL after the stream ends, giving
   * the frontend time to poll once more and see the final "idle" status.
   */
  private scheduleStreamingStateCleanup(sessionId: string): void {
    setTimeout(() => {
      const state = this.streamingStates.get(sessionId);
      if (state && state.status === 'idle') {
        this.streamingStates.delete(sessionId);
        this.logger.debug(
          `Cleaned up streaming state for session ${sessionId}`,
        );
      }
    }, STREAMING_STATE_TTL);
  }

  /**
   * Stream chat response (for SSE) with in-memory state tracking
   * so the history endpoint can expose partial progress for session-resume.
   */
  async *streamChat(
    sessionId: string,
    userMessage: string,
  ): AsyncGenerator<StreamChunk> {
    // Guard: reject if the same session is already streaming
    const existingState = this.streamingStates.get(sessionId);
    if (existingState?.status === 'streaming') {
      yield {
        type: 'error',
        data: 'Session is already processing a request. Wait for it to finish or poll the history endpoint for progress.',
      };
      return;
    }

    // --- Initialise streaming state ---
    this.streamingStates.set(sessionId, {
      status: 'streaming',
      partialResponse: '',
      tokenCount: 0,
      startedAt: new Date(),
      lastEventAt: new Date(),
      userMessage,
    });

    this.logger.log(`Streaming chat for session ${sessionId}`);

    // Validate session exists (should always pass after getOrCreateSession)
    const session = await this.prisma.memeResearchSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      this.streamingStates.delete(sessionId);
      yield { type: 'error', data: `Session not found: ${sessionId}` };
      return;
    }

    // Pre-flight credit check — reject early if the user cannot cover at least
    // one MemeGPT query. This prevents resource consumption for 0-credit users.
    const remaining = await this.creditService.getUserRemainingCredits(
      session.userId,
    );
    if (remaining < MEMEGPT_MIN_CREDITS) {
      const errState = this.streamingStates.get(sessionId);
      if (errState) errState.status = 'idle';
      this.scheduleStreamingStateCleanup(sessionId);
      yield {
        type: 'error',
        data: {
          code: 'INSUFFICIENT_CREDITS',
          available: remaining,
          required: MEMEGPT_MIN_CREDITS,
        },
      };
      return;
    }

    // Check if session already has a SUCCESSFUL research report.
    // Filter out FAILED reports so the user can retry after a failed run.
    const existingReport = await this.prisma.memeReport.findFirst({
      where: { sessionId, researchStatus: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
    });

    // When a completed report already exists, disable research_meme_coin to
    // avoid redundant re-research, but keep get_stored_report and
    // refresh_coin_data so the AI can answer follow-up and price-update requests.
    const enabledTools = existingReport
      ? this.tools.filter((t) => t.id !== 'research_meme_coin')
      : this.tools;

    if (existingReport) {
      this.logger.log(
        `Session ${sessionId} already has completed report - disabling research_meme_coin, keeping get_stored_report + refresh_coin_data`,
      );
    } else {
      this.logger.log(
        `Session ${sessionId} has no completed report - ENABLING all tools`,
      );
    }

    // Save user message
    await this.memoryStore.save(sessionId, 'user', userMessage);

    // Get history
    const history = await this.memoryStore.getHistory(sessionId, 20);

    // Inject session context so the LLM always knows which coin and session to use
    // in its tool calls — prevents hallucinated coin names or missing arguments.
    // Sanitize coinName to prevent prompt injection via crafted coin names.
    const safeCoinName = (session.coinName || '')
      .replace(/[^a-zA-Z0-9 _\-]/g, '')
      .slice(0, 30);
    const sessionContext =
      safeCoinName && safeCoinName !== 'General'
        ? `\n\n---\nCurrent session context:\n- Coin being researched: ${safeCoinName}\n- Session ID: ${sessionId}\n\nWhen calling tools, ALWAYS pass coin_name="${safeCoinName}" and session_id="${sessionId}".`
        : `\n\n---\nCurrent session ID: ${sessionId}. Always pass this as session_id in tool calls.`;

    const messages: OpenRouterMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT + sessionContext },
      ...history
        .filter((msg) => msg.role !== 'tool') // Grok doesn't support tool role in history
        .map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
    ];

    try {
      // Use streaming API with conditional tools
      let fullResponse = '';

      const toolDefs =
        enabledTools.length > 0
          ? enabledTools.map((tool) => ({
              type: 'function' as const,
              function: {
                name: tool.id,
                description: tool.description,
                parameters: tool.parameters,
              },
            }))
          : undefined;

      // Accumulate streamed tool-call deltas into complete tool call objects
      const pendingToolCalls: Map<
        number,
        {
          id: string;
          type: 'function';
          function: { name: string; arguments: string };
        }
      > = new Map();

      for await (const chunk of this.openRouter.streamChat({
        messages,
        tools: toolDefs,
        temperature: 0.3,
        maxTokens: 2000,
      })) {
        const choice = chunk?.choices?.[0];
        const delta = choice?.delta;

        if (delta?.content) {
          fullResponse += delta.content;

          // Track in streaming state for session-resume
          const state = this.streamingStates.get(sessionId);
          if (state) {
            state.partialResponse += delta.content;
            state.tokenCount++;
            state.lastEventAt = new Date();
          }

          yield { type: 'token', data: delta.content };
        }

        // Accumulate tool-call deltas
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx: number = tc.index ?? 0;
            if (!pendingToolCalls.has(idx)) {
              pendingToolCalls.set(idx, {
                id: tc.id ?? '',
                type: 'function',
                function: { name: tc.function?.name ?? '', arguments: '' },
              });
            }
            const entry = pendingToolCalls.get(idx)!;
            if (tc.id) entry.id = tc.id;
            if (tc.function?.name) entry.function.name = tc.function.name;
            if (tc.function?.arguments)
              entry.function.arguments += tc.function.arguments;
          }
          yield { type: 'tool_call', data: delta.tool_calls };
        }
      }

      // -----------------------------------------------------------
      // Execute tool calls if the model requested them
      // -----------------------------------------------------------
      if (pendingToolCalls.size > 0) {
        const assembledCalls = Array.from(pendingToolCalls.values());
        this.logger.log(
          `Executing ${assembledCalls.length} tool call(s) for session ${sessionId}`,
        );

        // Build assistant message that triggered the tool calls
        const assistantWithToolCalls: OpenRouterMessage = {
          role: 'assistant',
          content: fullResponse || '',
          tool_calls: assembledCalls,
        };

        const toolResultMessages: OpenRouterMessage[] = [];

        for (const tc of assembledCalls) {
          let toolResult: string;
          try {
            const toolArgs = JSON.parse(tc.function.arguments || '{}');
            const matchedTool = enabledTools.find(
              (t) => t.id === tc.function.name,
            );

            if (!matchedTool) {
              toolResult = JSON.stringify({
                error: `Unknown tool: ${tc.function.name}`,
              });
            } else {
              // SECURITY: Always override session_id for write tools (research/refresh)
              // to prevent FK violations if the LLM hallucinates a session ID.
              // get_stored_report is a READ-ONLY query — do NOT force session_id on it
              // because that would restrict lookup to the current session only, breaking
              // cross-session report retrieval for the same coin.
              if (
                tc.function.name === 'research_meme_coin' ||
                tc.function.name === 'refresh_coin_data'
              ) {
                toolArgs.session_id = sessionId;
              }

              // Inject coin_name from the session when the LLM omits it.
              // Only for tools that actually use coin_name as a parameter.
              if (
                !toolArgs.coin_name &&
                session?.coinName &&
                session.coinName !== 'General' &&
                (tc.function.name === 'research_meme_coin' ||
                  tc.function.name === 'refresh_coin_data' ||
                  tc.function.name === 'get_stored_report')
              ) {
                toolArgs.coin_name = session.coinName;
              }

              yield {
                type: 'tool_call',
                data: { executing: tc.function.name, args: toolArgs },
              };
              const result = await matchedTool.execute(toolArgs);
              toolResult =
                typeof result === 'string' ? result : JSON.stringify(result);

              // Only charge credits when the tool actually succeeded.
              // Tools return { success: false } on API errors rather than throwing,
              // so we must parse the result before billing.
              let toolSucceeded = true;
              try {
                const parsed = JSON.parse(toolResult);
                if (parsed.success === false) toolSucceeded = false;
              } catch {
                // Non-JSON result counts as success
              }

              const MEMEGPT_TOOL_COSTS: Record<string, number> = {
                research_meme_coin: MEMEGPT_RESEARCH_CREDIT_COST,
                refresh_coin_data: MEMEGPT_REFRESH_CREDIT_COST,
                get_stored_report: MEMEGPT_STORED_REPORT_CREDIT_COST,
                search_web: MEMEGPT_WEB_SEARCH_CREDIT_COST,
              };
              const creditCost = MEMEGPT_TOOL_COSTS[tc.function.name] ?? 0;
              if (creditCost > 0 && toolSucceeded) {
                await this.creditService.chargeForToolUsage({
                  userId: session.userId,
                  projectId: sessionId,
                  toolName: tc.function.name,
                  creditsToDeduct: creditCost,
                  toolType: 'meme-gpt',
                });
                this.logger.log(
                  `Charged ${creditCost} credits for ${tc.function.name} — user: ${session.userId}`,
                );
              } else if (creditCost > 0 && !toolSucceeded) {
                this.logger.warn(
                  `Skipped credit charge for ${tc.function.name} — tool returned failure, user: ${session.userId}`,
                );
              }

              yield {
                type: 'tool_result',
                data: { tool: tc.function.name, result: toolResult },
              };
            }
          } catch (toolErr) {
            this.logger.error(`Tool ${tc.function.name} failed:`, toolErr);
            toolResult = JSON.stringify({
              error:
                toolErr instanceof Error ? toolErr.message : String(toolErr),
            });
          }

          toolResultMessages.push({
            role: 'tool',
            content: toolResult,
            tool_call_id: tc.id,
          });
        }

        // Auto-fallback: if the LLM called get_stored_report on a new session
        // (no prior data) instead of research_meme_coin, chain research automatically.
        // Only triggers on get_stored_report returning no data — NOT on
        // research_meme_coin failures (API errors should bubble to the user).
        const researchTool = enabledTools.find(
          (t) => t.id === 'research_meme_coin',
        );
        // Find the tool call index for get_stored_report so we can check its result
        const getReportCallIndex = assembledCalls.findIndex(
          (tc) => tc.function.name === 'get_stored_report',
        );
        const noReportResult =
          researchTool && getReportCallIndex !== -1
            ? (() => {
                try {
                  const parsed = JSON.parse(
                    toolResultMessages[getReportCallIndex]?.content || '{}',
                  );
                  return parsed.success === false;
                } catch {
                  return false;
                }
              })()
            : false;

        const extraMessages: OpenRouterMessage[] = [];

        if (noReportResult && researchTool) {
          const coinName =
            session.coinName && session.coinName !== 'General'
              ? session.coinName
              : 'UNKNOWN';
          this.logger.log(
            `Auto-fallback: get_stored_report found no data for ${coinName}, chaining research_meme_coin`,
          );
          const fallbackArgs = { coin_name: coinName, session_id: sessionId };
          yield {
            type: 'tool_call',
            data: { executing: 'research_meme_coin', args: fallbackArgs },
          };

          try {
            const fallbackResult = await researchTool.execute(fallbackArgs);
            const fallbackStr =
              typeof fallbackResult === 'string'
                ? fallbackResult
                : JSON.stringify(fallbackResult);

            // Only charge if the fallback research actually succeeded
            let fallbackSucceeded = true;
            try {
              const parsed = JSON.parse(fallbackStr);
              if (parsed.success === false) fallbackSucceeded = false;
            } catch {
              // Non-JSON counts as success
            }

            if (fallbackSucceeded) {
              await this.creditService.chargeForToolUsage({
                userId: session.userId,
                projectId: sessionId,
                toolName: 'research_meme_coin',
                creditsToDeduct: MEMEGPT_RESEARCH_CREDIT_COST,
                toolType: 'meme-gpt',
              });
              this.logger.log(
                `Charged ${MEMEGPT_RESEARCH_CREDIT_COST} credits for auto-fallback research_meme_coin — user: ${session.userId}`,
              );
            } else {
              this.logger.warn(
                `Skipped credit charge for auto-fallback research_meme_coin — tool returned failure, user: ${session.userId}`,
              );
            }

            yield {
              type: 'tool_result',
              data: { tool: 'research_meme_coin', result: fallbackStr },
            };

            // Append as a synthetic tool call + result so the summarising LLM
            // receives the full research data in its context window.
            const synthId = `auto_fallback_${Date.now()}`;
            extraMessages.push(
              {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    id: synthId,
                    type: 'function',
                    function: {
                      name: 'research_meme_coin',
                      arguments: JSON.stringify(fallbackArgs),
                    },
                  },
                ],
              },
              { role: 'tool', content: fallbackStr, tool_call_id: synthId },
            );
          } catch (fallbackErr) {
            this.logger.error(
              `Auto-fallback research_meme_coin failed:`,
              fallbackErr,
            );
            // Non-fatal: fall through so the LLM can still synthesise with
            // the "no report" context and explain what happened.
          }
        }

        // Second streaming call: send tool results back to the model so it can
        // produce the final narrative. Pass the tool definitions with
        // tool_choice:'none' so the model understands the schema but is
        // explicitly told not to call any more tools — just respond with text.
        const messagesWithResults: OpenRouterMessage[] = [
          ...messages,
          assistantWithToolCalls,
          ...toolResultMessages,
          ...extraMessages,
        ];

        fullResponse = '';
        for await (const chunk of this.openRouter.streamChat({
          messages: messagesWithResults,
          tools: toolDefs, // Provide schema so model understands the context
          toolChoice: 'none', // But force a plain-text response, no more tool calls
          temperature: 0.3,
          maxTokens: 4096, // Analysis responses need more room than 2000 tokens
        })) {
          const delta = chunk?.choices?.[0]?.delta;

          if (delta?.content) {
            fullResponse += delta.content;

            const state = this.streamingStates.get(sessionId);
            if (state) {
              state.partialResponse += delta.content;
              state.tokenCount++;
              state.lastEventAt = new Date();
            }

            yield { type: 'token', data: delta.content };
          }
        }
      }

      // Save complete response to persistent store
      await this.memoryStore.save(sessionId, 'assistant', fullResponse);

      // Mark streaming as done
      const doneState = this.streamingStates.get(sessionId);
      if (doneState) {
        doneState.status = 'idle';
      }
      this.scheduleStreamingStateCleanup(sessionId);

      yield { type: 'done', data: null };
    } catch (error) {
      this.logger.error('Streaming failed:', error);

      // Mark streaming as idle on error and clean up
      const errState = this.streamingStates.get(sessionId);
      if (errState) {
        errState.status = 'idle';
      }
      this.scheduleStreamingStateCleanup(sessionId);

      if (error instanceof InsufficientCreditsError) {
        yield {
          type: 'error',
          data: { code: 'INSUFFICIENT_CREDITS', message: error.message },
        };
      } else {
        yield { type: 'error', data: error.message };
      }

      // Always send a done event after error so the frontend can close the stream.
      yield { type: 'done', data: null };
    }
  }

  /**
   * Get session history **plus** live streaming status for session-resume.
   *
   * When the session is actively streaming the response includes:
   * - `status: 'streaming'`
   * - `streaming: { partialResponse, tokenCount, startedAt, lastEventAt }`
   *
   * The frontend can poll this endpoint to reconstruct the UI while a
   * stream is in progress (or after a page reload).
   */
  async getSessionHistory(
    sessionId: string,
    requestingUserId?: string,
  ): Promise<{
    messages: ChatMessage[];
    status: 'streaming' | 'idle';
    streaming: {
      partialResponse: string;
      tokenCount: number;
      startedAt: string;
      lastEventAt: string;
    } | null;
  }> {
    // Validate session exists and belongs to the requesting user
    const session = await this.prisma.memeResearchSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || (requestingUserId && session.userId !== requestingUserId)) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }

    const messages = await this.memoryStore.getHistory(sessionId, 100);
    const filtered = messages
      .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
      .map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));

    // Check in-memory streaming state
    const streamState = this.streamingStates.get(sessionId);
    const isStreaming = streamState?.status === 'streaming';

    return {
      messages: filtered,
      status: isStreaming ? 'streaming' : 'idle',
      streaming: isStreaming
        ? {
            partialResponse: streamState.partialResponse,
            tokenCount: streamState.tokenCount,
            startedAt: streamState.startedAt.toISOString(),
            lastEventAt: streamState.lastEventAt.toISOString(),
          }
        : null,
    };
  }

  /**
   * Delete a session and all its related data (conversations, reports).
   * Prisma cascades handle child-record removal.
   * Rejects if the session is currently streaming.
   */
  async deleteSession(
    sessionId: string,
    requestingUserId: string,
  ): Promise<{ deleted: true; sessionId: string }> {
    // Verify session exists and belongs to the requesting user
    const session = await this.prisma.memeResearchSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }

    if (session.userId !== requestingUserId) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }

    // Prevent deletion while a stream is in progress
    const streamState = this.streamingStates.get(sessionId);
    if (streamState?.status === 'streaming') {
      throw new Error(
        'Cannot delete a session while it is actively streaming. Wait for the stream to finish.',
      );
    }

    // Clean up in-memory streaming state if present
    this.streamingStates.delete(sessionId);

    // Delete the session — cascades remove conversations & reports
    await this.prisma.memeResearchSession.delete({
      where: { id: sessionId },
    });

    this.logger.log(
      `Deleted session ${sessionId} for user ${requestingUserId}`,
    );

    return { deleted: true, sessionId };
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(userId: string): Promise<any[]> {
    const sessions = await this.prisma.memeResearchSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        _count: {
          select: {
            conversations: true,
            reports: true,
          },
        },
      },
    });

    return sessions.map((session) => ({
      id: session.id,
      coinName: session.coinName,
      status: session.status,
      createdAt: session.createdAt,
      messageCount: session._count.conversations,
      reportCount: session._count.reports,
    }));
  }
}
