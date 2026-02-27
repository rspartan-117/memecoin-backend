import { ApiProperty } from '@nestjs/swagger';

export class DeleteAssetResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Message',
    example: 'Asset deleted successfully',
  })
  message: string;

  @ApiProperty({
    description: 'Asset ID',
    example: 'asset_123abc',
  })
  assetId: string;
}
