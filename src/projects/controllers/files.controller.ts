import {
  Controller,
  Get,
  Param,
  UseGuards,
  Req,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiOkResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { FilesService } from '../services/files.service';
import {
  ProjectFilesResponse,
  ProjectFilesTreeResponse,
} from '../dtos/project-files.dto';
import { Request } from 'express';

@ApiTags('Project Files')
@Controller('projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class FilesController {
  private readonly logger = new Logger(FilesController.name);

  constructor(private readonly filesService: FilesService) {}

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
  // GET /projects/:projectId/files - Get all files (flat)
  // ============================================================

  @Get(':projectId/files')
  @ApiOperation({
    summary: 'Get project files (flat structure)',
    description:
      'Returns all non-deleted files in the project as a flat list. For file explorer UI, use /files/tree instead.',
  })
  @ApiParam({
    name: 'projectId',
    description: 'Project ID',
    example: 'proj_abc123',
  })
  @ApiOkResponse({
    description: 'Files retrieved successfully',
    type: ProjectFilesResponse,
  })
  @ApiNotFoundResponse({
    description: 'Project not found or user does not have access',
  })
  async getProjectFiles(
    @Param('projectId') projectId: string,
    @Req() req: Request,
  ): Promise<ProjectFilesResponse> {
    const userId = this.extractUserId(req);
    this.logger.log(`GET /projects/${projectId}/files - User: ${userId}`);

    return await this.filesService.getProjectFiles(projectId, userId);
  }

  // ============================================================
  // GET /projects/:projectId/files/tree - Get files with tree structure
  // ============================================================

  @Get(':projectId/files/tree')
  @ApiOperation({
    summary: 'Get project files (tree structure)',
    description:
      'Returns files organized in a hierarchical tree structure. Recommended for file explorer UI.',
  })
  @ApiParam({
    name: 'projectId',
    description: 'Project ID',
    example: 'proj_abc123',
  })
  @ApiOkResponse({
    description: 'File tree retrieved successfully',
    type: ProjectFilesTreeResponse,
  })
  @ApiNotFoundResponse({
    description: 'Project not found or user does not have access',
  })
  async getProjectFilesTree(
    @Param('projectId') projectId: string,
    @Req() req: Request,
  ): Promise<ProjectFilesTreeResponse> {
    const userId = this.extractUserId(req);
    this.logger.log(`GET /projects/${projectId}/files/tree - User: ${userId}`);

    return await this.filesService.getProjectFilesWithTree(projectId, userId);
  }
}
