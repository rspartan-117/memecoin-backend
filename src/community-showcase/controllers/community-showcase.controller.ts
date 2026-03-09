import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CommunityShowcaseService } from '../services/community-showcase.service';
import { CommunityShowcaseResponseDto } from '../dtos/community-showcase.dto';

@ApiTags('Community Showcase')
@ApiBearerAuth()
@Controller('community-showcase')
export class CommunityShowcaseController {
  constructor(
    private readonly communityShowcaseService: CommunityShowcaseService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all public deployed apps',
    description:
      'Returns all deployments marked as public (visibility = "pb") with status ACTIVE. ' +
      'Optionally filter by category. Results are cached for 24 hours.',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    enum: ['landingpage'],
    description:
      'Filter by project category. Currently only "landingpage" is supported.',
  })
  async getAllDeployedApps(
    @Query('category') category?: 'landingpage',
  ): Promise<CommunityShowcaseResponseDto> {
    return this.communityShowcaseService.getAllDeployedApps(category);
  }

  /**
   * DELETE /community-showcase/cache
   * Invalidates the Redis cache for the community showcase.
   * Requires authentication (JWT). Call this after adding/updating
   * the GOOGLE_PAGESPEED_API_KEY or after any visibility change.
   */
  @Delete('cache')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Invalidate showcase cache',
    description:
      'Clears the 24-hour Redis cache so the next GET request re-fetches ' +
      'fresh data and captures any missing screenshots.',
  })
  async invalidateCache(): Promise<{ message: string }> {
    await this.communityShowcaseService.invalidateCache();
    return { message: 'Community showcase cache invalidated successfully' };
  }
}
