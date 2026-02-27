/**
 * OpenRouter Service
 * Grok 4.1 Fast integration via OpenRouter API
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string; // For tool result messages
  tool_call_id?: string; // For tool result messages
  tool_calls?: OpenRouterToolCall[]; // For assistant messages that triggered tool calls
}

export interface OpenRouterToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface OpenRouterResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
      tool_calls?: OpenRouterToolCall[];
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

@Injectable()
export class OpenRouterService {
  private readonly logger = new Logger(OpenRouterService.name);
  private readonly client: AxiosInstance;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.getOrThrow<string>('OPENROUTER_API_KEY');
    this.baseUrl =
      this.config.get<string>('OPENROUTER_BASE_URL') ||
      'https://openrouter.ai/api/v1';
    this.model = this.config.get<string>('GROK_MODEL') || 'x-ai/grok-4.1-fast'; // Grok 4.1 Fast

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer':
          this.config.get<string>('SELF_DOMAIN') || 'http://localhost:4000',
        'X-Title': 'Meme GPT Agent',
      },
      timeout: 60000, // 1 minute
    });
  }

  /**
   * Chat completion with tool calling support
   */
  async chat(params: {
    messages: OpenRouterMessage[];
    tools?: ToolDefinition[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<OpenRouterResponse> {
    try {
      const requestBody: any = {
        model: this.model,
        messages: params.messages,
        temperature: params.temperature ?? 0.3,
        max_tokens: params.maxTokens ?? 2000,
      };

      // Add tools for Grok 4.1 Fast (supports tool calling)
      if (params.tools && params.tools.length > 0) {
        requestBody.tools = params.tools;
        requestBody.tool_choice = 'auto';
      }

      this.logger.log('OpenRouter request to ' + this.model);
      const response = await this.client.post('/chat/completions', requestBody);

      return response.data;
    } catch (error) {
      this.logger.error(
        'OpenRouter chat failed:',
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  /**
   * Streaming chat (for SSE)
   * @param toolChoice - 'auto' (model decides), 'none' (never call tools, just respond), omit to disable tools entirely
   */
  async *streamChat(params: {
    messages: OpenRouterMessage[];
    tools?: ToolDefinition[];
    toolChoice?: 'auto' | 'none';
    temperature?: number;
    maxTokens?: number;
  }): AsyncGenerator<any, void, unknown> {
    try {
      const requestBody: any = {
        model: this.model,
        messages: params.messages,
        temperature: params.temperature ?? 0.3,
        max_tokens: params.maxTokens ?? 2000,
        stream: true,
      };

      // Include tool definitions when provided.
      // tool_choice='auto'  → model decides whether to call a tool.
      // tool_choice='none'  → model must respond with text (used after tool results).
      if (params.tools && params.tools.length > 0) {
        requestBody.tools = params.tools;
        requestBody.tool_choice = params.toolChoice ?? 'auto';
      }

      const response = await this.client.post(
        '/chat/completions',
        requestBody,
        {
          responseType: 'stream',
        },
      );

      // Parse SSE stream
      for await (const chunk of response.data) {
        const lines = chunk
          .toString()
          .split('\n')
          .filter((line: string) => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }

            try {
              const parsed = JSON.parse(data);
              yield parsed;
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      this.logger.error('OpenRouter streaming failed:', error);
      throw error;
    }
  }

  /**
   * Get model information
   */
  getModelInfo() {
    return {
      model: this.model,
      provider: 'OpenRouter',
      description: 'Grok 4.1 Fast - Cost-effective LLM for meme coin analysis',
      pricing: {
        input: 0.03, // $0.03 per 1M tokens
        output: 0.03, // $0.03 per 1M tokens
      },
    };
  }
}
