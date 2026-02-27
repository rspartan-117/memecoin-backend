import { ApiProperty } from '@nestjs/swagger';

class DocumentAsset {
  @ApiProperty()
  asset_id: string;

  @ApiProperty()
  filename: string;

  @ApiProperty()
  s3_url: string;

  @ApiProperty()
  file_type: string;

  @ApiProperty()
  language?: string;

  @ApiProperty()
  is_code_file: boolean;

  @ApiProperty()
  summary?: string;

  @ApiProperty()
  total_chunks?: number;

  @ApiProperty()
  token_count?: number;

  @ApiProperty()
  rag_processed: boolean;

  @ApiProperty()
  added_at: string;
}

class ImageAsset {
  @ApiProperty()
  asset_id: string;

  @ApiProperty()
  filename: string;

  @ApiProperty()
  s3_url: string;

  @ApiProperty()
  image_url: string;

  @ApiProperty()
  analysis?: string;

  @ApiProperty()
  rag_processed: boolean;

  @ApiProperty()
  added_at: string;
}

export class AssetListResponseDto {
  @ApiProperty({
    description: 'List of document assets',
    type: [DocumentAsset],
  })
  documents: DocumentAsset[];

  @ApiProperty({
    description: 'List of image assets',
    type: [ImageAsset],
  })
  images: ImageAsset[];
}
