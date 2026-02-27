import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatOptionsDto {
  @ApiPropertyOptional({
    description: 'Temperature for response randomness (0.0-2.0)',
    example: 0.7,
    default: 0.5,
  })
  temperature?: number;

  @ApiPropertyOptional({
    description: 'Maximum tokens to generate',
    example: 16000,
    default: 16000,
  })
  maxTokens?: number;

  @ApiPropertyOptional({
    description: 'Timeout in seconds for agent processing',
    example: 300,
    default: 300,
  })
  timeout?: number;
}

export class ChatDto {
  @ApiProperty({
    description: 'Chat message to send to the agent',
    example: 'Create a player character that can jump',
  })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiProperty({
    description: 'AI model to use',
    example: 'x-ai/grok-4-fast',
  })
  @IsString()
  @IsNotEmpty()
  model: string;

  @ApiProperty({
    description: 'Model provider: openai, anthropic, google_genai, or openrouter',
    example: 'openrouter',
    enum: ['openai', 'anthropic', 'google_genai', 'openrouter'],
  })
  @IsString()
  @IsNotEmpty()
  model_provider: string;

  @ApiPropertyOptional({
    description: 'Chat options (temperature, maxTokens, timeout). Defaults: temperature=0.5, maxTokens=16000, timeout=300',
    type: ChatOptionsDto,
    example: { temperature: 0.7, maxTokens: 16000, timeout: 300 },
  })
  @IsObject()
  @IsOptional()
  options?: ChatOptionsDto;
}
