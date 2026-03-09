import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Req,
  Res,
  HttpStatus,
  Logger,
  UseGuards,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { ChatService } from '../services/chat.service';
import { ProjectsService } from '../services/projects.service';
import {
  CreditService,
  TOOL_CREDIT_COSTS,
  MINIMUM_CHAT_CREDITS,
} from '../services/credit.service';
import { ChatDto } from '../dtos';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';

@ApiTags('Chat & Conversations')
@Controller('projects/:projectId/chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly projectsService: ProjectsService,
    private readonly creditService: CreditService,
  ) {}

  /**
   * Extract user ID from request
   */
  private extractUserId(req: Request): string {
    const user = (req as any).user;

    if (!user) {
      throw new Error('User information is missing from request');
    }

    const userId = typeof user === 'string' ? user : user?.id || user?.userId;

    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid user information in request');
    }

    return userId;
  }

  // ============================================================
  // POST /projects/:projectId/chat - Chat with agent (streaming SSE)
  // ============================================================

  @Post()
  @ApiOperation({
    summary: 'Chat with agent (streaming)',
    description:
      'Send a message to the agent and receive streaming SSE responses',
  })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiBody({ type: ChatDto })
  @ApiResponse({
    status: 200,
    description: 'SSE stream established',
    type: String,
  })
  async streamChat(
    @Req() req: Request,
    @Res() res: Response,
    @Param('projectId') projectId: string,
    @Body() chatDto: ChatDto,
  ) {
    try {
      const userId = this.extractUserId(req);

      this.logger.log(`Chat request for project ${projectId}, user ${userId}`);

      // ── Pre-flight credit check ──────────────────────────────────
      // Reject before starting the stream so the client gets a proper
      // HTTP 402 instead of an empty SSE stream.
      const remainingCredits =
        await this.creditService.getUserRemainingCredits(userId);
      if (remainingCredits < MINIMUM_CHAT_CREDITS) {
        throw new HttpException(
          {
            message: `Insufficient credits. You need at least ${MINIMUM_CHAT_CREDITS} credits to start a chat. Current balance: ${remainingCredits}.`,
            code: 'INSUFFICIENT_CREDITS',
            required: MINIMUM_CHAT_CREDITS,
            available: remainingCredits,
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }

      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
      res.setHeader('Access-Control-Allow-Origin', '*'); // CORS for SSE
      res.flushHeaders(); // Important: flush headers immediately

      // Handle client disconnect
      req.on('close', () => {
        this.logger.log(`Client disconnected for project ${projectId}`);
      });

      try {
        // Get project to extract document context and image URLs
        const project = await this.projectsService.findOne(projectId, userId);
        const metadata = (project.metadata as any) || {};

        // Update project status to ACTIVE when user sends a new message
        await this.projectsService.updateProjectStatus(projectId, 'ACTIVE');

        const documentContext = (metadata.documents || [])
          .filter((d) => d.rag_processed)
          .map((d) => ({
            filename: d.filename,
            type: d.file_type,
            summary: d.summary,
          }));

        const imageUrls = (metadata.images || [])
          .filter((i) => i.rag_processed)
          .map((i) => i.s3_url);

        // Get the stream from Chat Service
        const axiosResponse = await this.chatService.streamChat(
          projectId,
          userId,
          chatDto.model,
          chatDto.model_provider,
          chatDto.message,
          documentContext,
          imageUrls,
          chatDto.options,
        );

        // Send project info as first event
        res.write(`event: project\ndata: ${JSON.stringify({ projectId })}\n\n`);

        // Send initial connection test
        res.write(': connected\n\n');

        // Pipe the stream directly to the response
        axiosResponse.data.on('data', (chunk: Buffer) => {
          if (!res.writableEnded) {
            // Parse chunk to check for billable events
            try {
              const chunkStr = chunk.toString('utf-8');

              // Split into individual SSE events (separated by double newline)
              const sseEvents = chunkStr.split('\n\n');

              for (const sseEvent of sseEvents) {
                if (!sseEvent.trim()) continue;

                // ── agent_complete → charge cumulative AI token usage ──
                if (sseEvent.includes('event: agent_complete')) {
                  const dataLine = sseEvent
                    .split('\n')
                    .find((line) => line.startsWith('data: '));
                  if (dataLine) {
                    const eventData = JSON.parse(dataLine.substring(6));

                    if (eventData.usage_metadata) {
                      const modelName = eventData.model_name || 'unknown';
                      const eventProjectId = eventData.project_id || projectId;
                      const inputTokens =
                        eventData.usage_metadata.input_tokens || 0;
                      const outputTokens =
                        eventData.usage_metadata.output_tokens || 0;
                      const totalTokens =
                        eventData.usage_metadata.total_tokens || 0;

                      this.logger.log(
                        `Token Usage (cumulative) - Project: ${eventProjectId}, Model: ${modelName}, ` +
                          `Input: ${inputTokens}, Output: ${outputTokens}, Total: ${totalTokens}`,
                      );

                      // Process AI model charge asynchronously (don't block response)
                      this.creditService
                        .processAIModelCharge({
                          userId,
                          projectId: eventProjectId,
                          modelName,
                          inputTokens,
                          outputTokens,
                          totalTokens,
                        })
                        .catch((error) => {
                          this.logger.error(
                            `Error processing AI model charge: ${error.message}`,
                            error.stack,
                          );
                        });
                    }
                  }
                }

                // ── tool_complete → charge for external API tools ──────
                if (sseEvent.includes('event: tool_complete')) {
                  const dataLine = sseEvent
                    .split('\n')
                    .find((line) => line.startsWith('data: '));
                  if (dataLine) {
                    const eventData = JSON.parse(dataLine.substring(6));
                    const toolName = eventData.tool_name;

                    if (toolName && TOOL_CREDIT_COSTS[toolName]) {
                      const creditsToDeduct = TOOL_CREDIT_COSTS[toolName];

                      this.logger.log(
                        `Billable tool completed: ${toolName} → ${creditsToDeduct} credits (project: ${projectId})`,
                      );

                      this.creditService
                        .chargeForToolUsage({
                          userId,
                          projectId,
                          toolName,
                          creditsToDeduct,
                        })
                        .catch((error) => {
                          this.logger.error(
                            `Error charging for tool ${toolName}: ${error.message}`,
                            error.stack,
                          );
                        });
                    }
                  }
                }
              }
            } catch (parseError) {
              // Silently ignore parse errors, continue streaming
            }

            res.write(chunk);
          }
        });

        // Handle stream errors
        axiosResponse.data.on('error', async (error: Error) => {
          this.logger.error(`Stream error: ${error.message}`);

          // Update project status to ENDED on error
          try {
            await this.projectsService.updateProjectStatus(projectId, 'ENDED');
          } catch (statusError) {
            this.logger.error(
              `Failed to update project status to ENDED after error: ${statusError.message}`,
            );
          }

          if (!res.writableEnded) {
            res.write(
              `event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`,
            );
            res.end();
          }
        });

        // Handle stream end
        axiosResponse.data.on('end', async () => {
          this.logger.log(`Stream ended for project ${projectId}`);

          // Update project status to ENDED when stream completes successfully
          try {
            await this.projectsService.updateProjectStatus(projectId, 'ENDED');
          } catch (statusError) {
            this.logger.error(
              `Failed to update project status to ENDED: ${statusError.message}`,
            );
          }

          if (!res.writableEnded) {
            res.end();
          }
        });
      } catch (streamError) {
        this.logger.error(`Stream initiation error: ${streamError.message}`);

        // Update project status to ENDED on stream initiation error
        try {
          await this.projectsService.updateProjectStatus(projectId, 'ENDED');
        } catch (statusError) {
          this.logger.error(
            `Failed to update project status to ENDED after stream error: ${statusError.message}`,
          );
        }

        if (!res.writableEnded) {
          res.write(
            `event: error\ndata: ${JSON.stringify({ message: streamError.message })}\n\n`,
          );
          res.end();
        }
      }
    } catch (error) {
      this.logger.error(`Chat endpoint error: ${error.message}`, error.stack);

      // Only send JSON error if headers haven't been sent yet
      if (!res.headersSent) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          message: 'Failed to initiate chat',
          error: error.message,
        });
      } else if (!res.writableEnded) {
        res.write(
          `event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`,
        );
        res.end();
      }
    }
  }

  // ============================================================
  // GET /projects/:projectId/chat/history - Get conversation history
  // ============================================================

  @Get('history')
  @ApiOperation({
    summary: 'Get conversation history',
    description:
      'Get the conversation history for a project with sandbox data, status, deployment and GitHub information',
  })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: 200,
    description:
      'Conversation history retrieved with sandbox data, deployment information, and GitHub details (repo URL and username)',
  })
  async getHistory(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Query('limit') limit?: number,
  ): Promise<any> {
    try {
      const userId = this.extractUserId(req);
      this.logger.log(`Getting history for project ${projectId}`);

      // Get project details (includes sandbox info and deployment)
      const project = await this.projectsService.findOne(projectId, userId);

      // Get conversation history
      const history = await this.chatService.getHistory(
        projectId,
        userId,
        limit,
      );

      // Extract metadata for URLs
      const metadata = (project.metadata as any) || {};

      // Return combined response with sandbox data, status, deployment and GitHub information
      return {
        ...history,
        sandbox_data: {
          sandbox_id: project.active_sandbox_id,
          sandbox_state: project.sandbox_state,
          status: project.status,
          frontend_url: project.frontend_url || metadata.frontend_url,
          backend_url: project.backend_url || metadata.backend_url,
        },
        deployment: project.deployment || null,
        github_info: {
          githubRepoUrl:
            project.githubRepoUrl || project.deployment?.githubRepoUrl || null,
          githubUsername: project.githubUsername || null,
        },
      };
    } catch (error) {
      this.logger.error(`Get history error: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Failed to get history',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // GET /projects/:projectId/chat/state - Get agent state
  // ============================================================

  @Get('state')
  @ApiOperation({
    summary: 'Get agent state',
    description: 'Get the current state of the agent for a project',
  })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: 200,
    description: 'Agent state retrieved',
  })
  async getState(
    @Req() req: Request,
    @Param('projectId') projectId: string,
  ): Promise<any> {
    try {
      const userId = this.extractUserId(req);
      this.logger.log(`Getting state for project ${projectId}`);

      // Verify project ownership
      await this.projectsService.findOne(projectId, userId);

      return await this.chatService.getState(projectId, userId);
    } catch (error) {
      this.logger.error(`Get state error: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Failed to get state',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
