import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
  Req,
  HttpStatus,
  Logger,
  UseGuards,
  HttpException,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { ProjectsService } from '../services/projects.service';
import { DownloadService } from '../services/download.service';
import {
  DownloadRequestDto,
  DownloadResponseDto,
  ListZipsResponseDto,
  CleanupResponseDto,
} from '../dtos';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';

@ApiTags('Projects - Downloads')
@Controller('projects/:projectId/download')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class DownloadController {
  private readonly logger = new Logger(DownloadController.name);

  constructor(
    private readonly projectsService: ProjectsService,
    private readonly downloadService: DownloadService,
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
  // POST /projects/:projectId/download - Create ZIP download
  // ============================================================

  @Post()
  @ApiOperation({
    summary: 'Create ZIP download',
    description: 'Create a downloadable ZIP archive of project files',
  })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiBody({ type: DownloadRequestDto })
  @ApiResponse({
    status: 201,
    description: 'ZIP download created successfully',
    type: DownloadResponseDto,
  })
  async createDownload(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Body() dto: DownloadRequestDto,
  ): Promise<DownloadResponseDto> {
    try {
      const userId = this.extractUserId(req);
      this.logger.log(
        `Creating download for project ${projectId}, user ${userId}`,
      );

      // Verify project ownership
      await this.projectsService.findOne(projectId, userId);

      return await this.downloadService.createDownload(
        projectId,
        userId,
        dto.source_path,
        dto.zip_name,
        dto.exclude_patterns,
        dto.use_defaults ?? true,
        dto.url_expiration,
      );
    } catch (error) {
      this.logger.error(`Create download error: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Failed to create download',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // GET /projects/:projectId/download/list - List existing ZIPs
  // ============================================================

  @Get('list')
  @ApiOperation({
    summary: 'List ZIP files',
    description: 'List all existing ZIP downloads for a project',
  })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: 200,
    description: 'ZIP list retrieved successfully',
    type: ListZipsResponseDto,
  })
  async listZips(
    @Req() req: Request,
    @Param('projectId') projectId: string,
  ): Promise<ListZipsResponseDto> {
    try {
      const userId = this.extractUserId(req);
      this.logger.log(`Listing ZIPs for project ${projectId}, user ${userId}`);

      // Verify project ownership
      await this.projectsService.findOne(projectId, userId);

      return await this.downloadService.listZips(projectId, userId);
    } catch (error) {
      this.logger.error(`List ZIPs error: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Failed to list ZIPs',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // DELETE /projects/:projectId/download/cleanup - Delete ZIPs
  // ============================================================

  @Delete('cleanup')
  @ApiOperation({
    summary: 'Cleanup ZIP files',
    description: 'Delete ZIP files from project (all or specific sandbox path)',
  })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiQuery({
    name: 'sandbox_path',
    required: false,
    description: 'Specific sandbox path to delete (optional)',
    example: '/workspace/downloads/project_123.zip',
  })
  @ApiResponse({
    status: 200,
    description: 'ZIPs cleaned up successfully',
    type: CleanupResponseDto,
  })
  async cleanupZips(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Query('sandbox_path') sandboxPath?: string,
  ): Promise<CleanupResponseDto> {
    try {
      const userId = this.extractUserId(req);
      this.logger.log(
        `Cleaning up ZIPs for project ${projectId}, user ${userId}, path: ${sandboxPath || 'ALL'}`,
      );

      // Verify project ownership
      await this.projectsService.findOne(projectId, userId);

      return await this.downloadService.cleanupZips(
        projectId,
        userId,
        sandboxPath,
      );
    } catch (error) {
      this.logger.error(`Cleanup ZIPs error: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Failed to cleanup ZIPs',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
