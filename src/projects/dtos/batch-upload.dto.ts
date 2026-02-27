import { ApiProperty } from '@nestjs/swagger';
import { UploadDocumentResponseDto } from './upload-document.dto';

/**
 * Response DTO for a single document in batch upload
 */
export class BatchDocumentResultDto {
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

  @ApiProperty({
    description: 'Programming language (if code file)',
    example: 'typescript',
    required: false,
  })
  language?: string;

  @ApiProperty({
    description: 'Whether this is a code file',
    example: false,
  })
  is_code_file: boolean;

  @ApiProperty({
    description: 'Document summary',
    example: 'This document contains...',
    required: false,
  })
  summary?: string;

  @ApiProperty({
    description: 'Total chunks created',
    example: 5,
    required: false,
  })
  total_chunks?: number;

  @ApiProperty({
    description: 'Token count',
    example: 1500,
    required: false,
  })
  token_count?: number;

  @ApiProperty({
    description: 'Whether RAG processing is complete',
    example: true,
  })
  rag_processed: boolean;

  @ApiProperty({
    description: 'Error message (if failed)',
    example: 'Processing failed: invalid file format',
    required: false,
  })
  error?: string;

  @ApiProperty({
    description: 'Result message',
    example: 'Document processed successfully',
    required: false,
  })
  message?: string;
}

/**
 * Response DTO for batch document upload
 */
export class BatchUploadDocumentsResponseDto {
  @ApiProperty({
    description: 'Overall success status (true if at least one succeeded)',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Total number of documents uploaded',
    example: 5,
  })
  total_documents: number;

  @ApiProperty({
    description: 'Number of successfully processed documents',
    example: 4,
  })
  successful: number;

  @ApiProperty({
    description: 'Number of failed documents',
    example: 1,
  })
  failed: number;

  @ApiProperty({
    description: 'Processing results for each document',
    type: [BatchDocumentResultDto],
  })
  results: BatchDocumentResultDto[];

  @ApiProperty({
    description: 'Overall message',
    example: 'Batch processing complete: 4/5 documents processed successfully',
  })
  message: string;
}
