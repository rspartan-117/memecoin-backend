/**
 * Meme GPT Controller
 * REST API endpoints for meme coin research agent
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Req,
  Sse,
  MessageEvent,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { MemeGptService } from './meme-gpt.service';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ChatRequest {
  message: string;
  sessionId: string;
  coinName?: string;
}

@ApiTags('Meme GPT')
@Controller('meme-gpt')
export class MemeGptController {
  private readonly logger = new Logger(MemeGptController.name);

  constructor(private readonly memeGptService: MemeGptService) {}

  /**
   * GET /meme-gpt/health
   * Health check for Meme GPT module (PUBLIC - No auth required)
   */
  @Get('health')
  @ApiOperation({ summary: 'Health check for Meme GPT module' })
  @ApiResponse({ status: 200, description: 'Module is healthy' })
  health() {
    return {
      status: 'ok',
      module: 'Meme GPT',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * POST /meme-gpt/chat/stream
   * Stream chat response (SSE)
   * Frontend ALWAYS passes sessionId. If session exists, continue in it.
   * If session doesn't exist, a new one is created automatically.
   */
  @Post('chat/stream')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Stream chat with Meme GPT (Server-Sent Events)',
    description:
      'Stream messages from Meme GPT. Always pass a sessionId — if the session exists the conversation continues; if not a new session is created automatically. First SSE event confirms the session.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Tell me about Solana meme coins',
          description: 'Your message to Meme GPT',
        },
        sessionId: {
          type: 'string',
          description:
            'Session ID. Pass a new UUID for a fresh conversation or an existing one to continue.',
          example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        },
        coinName: {
          type: 'string',
          example: 'BONK',
          description: 'Optional: Coin name/ticker to focus the conversation',
        },
      },
      required: ['message', 'sessionId'],
    },
  })
  @ApiResponse({ status: 200, description: 'Server-Sent Events stream' })
  @ApiResponse({ status: 400, description: 'Missing sessionId' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Sse()
  async streamChat(
    @Req() req: any,
    @Body() body: ChatRequest,
  ): Promise<Observable<MessageEvent>> {
    const userId = req.user;
    const sessionId = (body.sessionId || '').trim();

    if (!sessionId) {
      this.logger.warn(
        `User ${userId} attempted chat stream without sessionId`,
      );
      throw new BadRequestException('sessionId is required');
    }

    if (!body.message) {
      throw new BadRequestException('message is required');
    }

    // Get existing session or create a new one transparently
    const { isNew } = await this.memeGptService.getOrCreateSession(
      sessionId,
      userId,
      body.coinName,
    );

    // Convert async generator to Observable
    const controller = this;
    return from(
      (async function* () {
        // First event: confirm the session to the frontend
        yield { type: 'session', data: { sessionId, isNew } };

        for await (const chunk of controller.memeGptService.streamChat(
          sessionId,
          body.message,
        )) {
          yield chunk;
        }
      })(),
    ).pipe(
      map((chunk) => ({
        data: chunk,
      })),
    ) as Observable<MessageEvent>;
  }

  /**
   * GET /meme-gpt/sessions/:sessionId/history
   * Get conversation history + live streaming state for a session.
   * Poll this endpoint to resume a session — if a stream is in progress
   * the response includes `status: 'streaming'` and accumulated partial data.
   */
  @Get('sessions/:sessionId/history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get conversation history for a session (with live status)',
    description:
      'Returns full message history plus a `status` field (`streaming` | `idle`). ' +
      'When `streaming`, includes a `streaming` object with the partial response ' +
      'accumulated so far, token count and timestamps — use this for session-resume polling.',
  })
  @ApiResponse({
    status: 200,
    description: 'Session history with streaming status',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getHistory(@Req() req: any, @Param('sessionId') sessionId: string) {
    const userId = req.user;
    const result = await this.memeGptService.getSessionHistory(
      sessionId,
      userId,
    );
    return {
      sessionId,
      ...result,
      count: result.messages.length,
    };
  }

  /**
   * GET /meme-gpt/sessions
   * Get all sessions for the authenticated user (userId from JWT)
   */
  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all sessions for the authenticated user' })
  @ApiResponse({ status: 200, description: 'User sessions retrieved' })
  async getUserSessions(@Req() req: any) {
    const userId = req.user;
    const sessions = await this.memeGptService.getUserSessions(userId);
    return {
      sessions,
      count: sessions.length,
    };
  }
}
