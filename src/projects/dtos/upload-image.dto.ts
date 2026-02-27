import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UploadImageResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Asset ID',
    example: 'asset_456def',
  })
  asset_id: string;

  @ApiProperty({
    description: 'Filename',
    example: 'image.png',
  })
  filename: string;

  @ApiProperty({
    description: 'S3 URL',
    example: 'https://bucket.s3.amazonaws.com/path/to/image.png',
  })
  s3_url: string;

  @ApiProperty({
    description: 'Image URL (for display)',
    example: 'https://cdn.example.com/image.png',
  })
  image_url: string;

  @ApiPropertyOptional({
    description: 'Image analysis result',
    example: 'A screenshot showing a user interface with...',
  })
  analysis?: string;

  @ApiProperty({
    description: 'Whether RAG processing is complete',
    example: true,
  })
  rag_processed: boolean;

  @ApiPropertyOptional({
    description: 'Error message if processing failed',
    example: 'Failed to analyze image',
  })
  error?: string;

  @ApiPropertyOptional({
    description: 'Processing status message',
    example: 'Image processed successfully',
  })
  message?: string;

  @ApiProperty({
    description: 'Upload timestamp',
  })
  added_at: string;
}
