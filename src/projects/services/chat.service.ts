import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';
import { PrismaService } from '../../shared/services/prisma.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly pythonApiUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.pythonApiUrl = this.configService.get<string>(
      'PYTHON_API_URL',
      'http://localhost:8000',
    );
    this.logger.log(`Python API URL: ${this.pythonApiUrl}`);
  }

  /**
   * Stream chat with agent (returns Axios response for SSE)
   * 
   * Python Endpoint: POST /chat
   * Request: MessageRequest with message, project_id, user_id, model, model_provider, 
   *          streaming, temperature, timeout, max_tokens, document_context, image_urls
   * Response: SSE stream with events: agent_start, agent_thinking, tool_start, 
   *           tool_complete, agent_complete
   * 
   * @param projectId - Project ID (used as thread_id in Python)
   * @param userId - User ID for memory namespace
   * @param model - AI model name (e.g., "x-ai/grok-4-fast")
   * @param modelProvider - Provider: openai, anthropic, google_genai, openrouter
   * @param message - User message
   * @param documentContext - Document summaries for RAG context
   * @param imageUrls - Image URLs for vision models
   * @param options - Chat options (temperature, timeout, maxTokens)
   * @returns Axios response with SSE stream
   */
  async streamChat(
    projectId: string,
    userId: string,
    model: string,
    modelProvider: string,
    message: string,
    documentContext?: any[],
    imageUrls?: string[],
    options?: any,
  ): Promise<AxiosResponse> {
    const url = `${this.pythonApiUrl}/chat`;

    this.logger.log(
      `Streaming chat for project ${projectId}, user ${userId}, message: ${message.substring(0, 50)}...`,
    );
    this.logger.debug(`Model: ${model}, Provider: ${modelProvider}`);
    this.logger.debug(`Document context: ${documentContext?.length || 0} docs, Image URLs: ${imageUrls?.length || 0} images`);

    try {
      // Update last active timestamp
      await this.prisma.project.update({
        where: { id: projectId },
        data: { last_active: new Date() },
      });

      const payload = {
        message,
        project_id: projectId,
        user_id: userId,
        model,
        model_provider: modelProvider,
        streaming: true,
        temperature: options?.temperature ?? 0.5,
        timeout: options?.timeout ?? 300, // Python processing timeout in seconds
        max_tokens: options?.maxTokens ?? 16000, // Map camelCase to snake_case with default 16000
        document_context: documentContext || [],
        image_urls: imageUrls || [],
      };

      this.logger.debug(`Request payload: ${JSON.stringify(payload, null, 2)}`);

      const response = await firstValueFrom(
        this.httpService.post(url, payload, {
          responseType: 'stream',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          timeout: 1800000, // 30 minute HTTP timeout for streaming
        }),
      );

      this.logger.debug(`Stream established for project ${projectId}`);
      return response;
    } catch (error) {
      this.logger.error(`Error streaming chat: ${error.message}`, error.stack);
      
      // Parse Python error detail if available
      const detail = error.response?.data?.detail || error.message;
      const status = error.response?.status || HttpStatus.BAD_GATEWAY;
      
      throw new HttpException(
        `Failed to stream chat: ${detail}`,
        status,
      );
    }
  }

  /**
   * Get conversation history
   * 
   * Python Endpoint: POST /projects/history
   * Request: { project_id: string, limit: int }
   * Response: { project_id: string, count: int, history: array }
   * 
   * @param projectId - Project ID
   * @param userId - User ID (for logging only, not used in Python endpoint)
   * @param limit - Maximum number of history entries (default: 50)
   * @returns History data from Python
   */
  async getHistory(
    projectId: string,
    userId: string,
    limit: number = 50,
  ): Promise<any> {
    const url = `${this.pythonApiUrl}/projects/history`;

    this.logger.log(`Fetching history for project ${projectId}, limit: ${limit}`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          url,
          {
            project_id: projectId,
            limit: limit,
          },
          { timeout: 30000 }, // 30 seconds timeout
        ),
      );
      
      this.logger.debug(`Retrieved ${response.data.count || 0} history entries`);
      return response.data;
    } catch (error) {
      this.logger.error(
        `Error fetching conversation history: ${error.message}`,
        error.stack,
      );
      
      // Parse Python error detail if available
      const detail = error.response?.data?.detail || error.message;
      const status = error.response?.status || HttpStatus.BAD_GATEWAY;
      
      throw new HttpException(
        `Failed to fetch conversation history: ${detail}`,
        status,
      );
    }
  }

  /**
   * Get current agent state
   * 
   * Python Endpoint: POST /projects/state
   * Request: { project_id: string }
   * Response: { project_id: string, state: object | null, message?: string }
   * 
   * @param projectId - Project ID
   * @param userId - User ID (for logging only, not used in Python endpoint)
   * @returns Current agent state from Python
   */
  async getState(projectId: string, userId: string): Promise<any> {
    const url = `${this.pythonApiUrl}/projects/state`;

    this.logger.log(`Fetching state for project ${projectId}`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          url,
          {
            project_id: projectId,
          },
          { timeout: 30000 }, // 30 seconds timeout
        ),
      );
      
      this.logger.debug(`State retrieved: ${response.data.state ? 'exists' : 'null'}`);
      return response.data;
    } catch (error) {
      this.logger.error(
        `Error fetching agent state: ${error.message}`,
        error.stack,
      );
      
      // Parse Python error detail if available
      const detail = error.response?.data?.detail || error.message;
      const status = error.response?.status || HttpStatus.BAD_GATEWAY;
      
      throw new HttpException(
        `Failed to fetch agent state: ${detail}`,
        status,
      );
    }
  }
}
