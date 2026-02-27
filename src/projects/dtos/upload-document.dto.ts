import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UploadDocumentResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Asset ID',
    example: 'asset_123abc',
  })
  asset_id: string;

  @ApiProperty({
    description: 'Filename',
    example: 'document.pdf',
  })
  filename: string;

  @ApiProperty({
    description: 'S3 URL',
    example: 'https://bucket.s3.amazonaws.com/path/to/file.pdf',
  })
  s3_url: string;

  @ApiProperty({
    description: 'File type',
    example: 'pdf',
  })
  file_type: string;

  @ApiPropertyOptional({
    description: 'Programming language (if code file)',
    example: 'typescript',
  })
  language?: string;

  @ApiProperty({
    description: 'Whether this is a code file',
    example: false,
  })
  is_code_file: boolean;

  @ApiPropertyOptional({
    description: 'Document summary',
    example: 'This document contains...',
  })
  summary?: string;

  @ApiPropertyOptional({
    description: 'Total chunks created',
    example: 5,
  })
  total_chunks?: number;

  @ApiPropertyOptional({
    description: 'Token count',
    example: 1500,
  })
  token_count?: number;

  @ApiProperty({
    description: 'Whether RAG processing is complete',
    example: true,
  })
  rag_processed: boolean;

  @ApiPropertyOptional({
    description: 'Error message if processing failed',
    example: 'Failed to parse document',
  })
  error?: string;

  @ApiPropertyOptional({
    description: 'Processing status message',
    example: 'Document processed successfully',
  })
  message?: string;

  @ApiProperty({
    description: 'Upload timestamp',
  })
  added_at: string;
}
