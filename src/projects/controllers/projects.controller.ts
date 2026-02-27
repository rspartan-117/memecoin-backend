import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
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
  ApiOkResponse,
} from '@nestjs/swagger';
import { ProjectsService } from '../services/projects.service';
import {
  CreateProjectDto,
  ProjectResponseDto,
  ProjectsListResponseDto,
  PauseResponseDto,
  ResumeProjectResponseDto,
  DeleteProjectResponseDto,
} from '../dtos';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';

@ApiTags('Projects')
@Controller('projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  private readonly logger = new Logger(ProjectsController.name);

  constructor(private readonly projectsService: ProjectsService) {}

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
  // POST /projects - Create new project
  // ============================================================

  @Post()
  @ApiOperation({
    summary: 'Create new project',
    description:
      'Creates a new project and initializes an E2B sandbox session.',
  })
  @ApiBody({ type: CreateProjectDto })
  @ApiOkResponse({
    description: 'Project created successfully',
    type: ProjectResponseDto,
    schema: {
      example: {
        id: 'proj_a1b2c3d4e5f6',
        userId: 'user_123',
        name: 'My Game Project',
        description: 'An awesome game',
        type: 'LANDING_PAGE',
        active_sandbox_id: 'sb_xyz789',
        sandbox_state: 'RUNNING',
        status: 'ACTIVE',
        frontend_url: 'https://sb-xyz789.e2b.dev',
        backend_url: 'https://sb-xyz789-8000.e2b.dev',
        metadata: {},
        created_at: '2026-01-26T10:00:00Z',
        updated_at: '2026-01-26T10:00:00Z',
        last_active: '2026-01-26T10:00:00Z',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data',
    schema: {
      example: {
        statusCode: 400,
        message: ['name should not be empty', 'name must be a string'],
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({
    status: 429,
    description: 'Resource limit exceeded - too many active sandboxes',
    schema: {
      example: {
        statusCode: 429,
        message: 'Resource limit exceeded: Maximum 2 active sandboxes per user',
        error: 'Too Many Requests',
      },
    },
  })
  @ApiResponse({
    status: 502,
    description: 'Python backend error - sandbox creation failed',
    schema: {
      example: {
        statusCode: 502,
        message: 'Failed to create project: E2B API timeout',
        error: 'Bad Gateway',
      },
    },
  })
  async createProject(
    @Req() req: Request,
    @Body() dto: CreateProjectDto,
  ): Promise<ProjectResponseDto> {
    try {
      const userId = this.extractUserId(req);
      this.logger.log(`Creating project for user ${userId}`);

      return await this.projectsService.createProject(userId, dto);
    } catch (error) {
      this.logger.error(`Create project error: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Failed to create project',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // GET /projects - List user's projects
  // ============================================================

  @Get()
  @ApiOperation({
    summary: 'List user projects',
    description: 'Get all projects for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Projects retrieved successfully',
    type: ProjectsListResponseDto,
  })
  async listProjects(@Req() req: Request): Promise<ProjectsListResponseDto> {
    try {
      const userId = this.extractUserId(req);
      this.logger.log(`Listing projects for user ${userId}`);

      return await this.projectsService.findAll(userId);
    } catch (error) {
      this.logger.error(`List projects error: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Failed to list projects',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // GET /projects/:id - Get project details
  // ============================================================

  @Get(':id')
  @ApiOperation({
    summary: 'Get project details',
    description: 'Get detailed information about a specific project',
  })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiResponse({
    status: 200,
    description: 'Project details retrieved',
    type: ProjectResponseDto,
  })
  async getProject(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<ProjectResponseDto> {
    try {
      const userId = this.extractUserId(req);
      this.logger.log(`Getting project ${id} for user ${userId}`);

      return await this.projectsService.findOne(id, userId);
    } catch (error) {
      this.logger.error(`Get project error: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Failed to get project',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // POST /projects/:id/resume - Resume existing project
  // ============================================================

  @Post(':id/resume')
  @ApiOperation({
    summary: 'Resume existing project',
    description:
      'Resume/reconnect to an existing project sandbox. This will restart a paused sandbox and update its URLs.',
  })
  @ApiParam({
    name: 'id',
    description: 'Project ID',
    example: 'proj_a1b2c3d4e5f6',
  })
  @ApiOkResponse({
    description: 'Project resumed successfully',
    type: ResumeProjectResponseDto,
    schema: {
      example: {
        success: true,
        message: 'Project resumed successfully',
        project_id: 'proj_a1b2c3d4e5f6',
        sandbox_id: 'sb_xyz789',
        previous_state: 'PAUSED',
        current_state: 'RUNNING',
        frontend_url: 'https://sb-xyz789.e2b.dev',
        backend_url: 'https://sb-xyz789-8000.e2b.dev',
        resumed_at: '2026-01-26T10:30:00Z',
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Project not found or does not belong to user',
    schema: {
      example: {
        statusCode: 404,
        message: 'Project not found',
        error: 'Not Found',
      },
    },
  })
  @ApiResponse({
    status: 502,
    description: 'Python backend error - sandbox resumption failed',
    schema: {
      example: {
        statusCode: 502,
        message: 'Failed to resume project: Sandbox connection timeout',
        error: 'Bad Gateway',
      },
    },
  })
  async resumeProject(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<ResumeProjectResponseDto> {
    try {
      const userId = this.extractUserId(req);
      this.logger.log(`Resuming project ${id} for user ${userId}`);

      return await this.projectsService.resumeProject(id, userId);
    } catch (error) {
      this.logger.error(`Resume project error: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Failed to resume project',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // POST /projects/:id/pause - Pause project sandbox
  // ============================================================

  @Post(':id/pause')
  @ApiOperation({
    summary: 'Pause project sandbox',
    description:
      'Pause the sandbox associated with a project. This stops billing and frees up resources. The sandbox can be resumed later within 30 days.',
  })
  @ApiParam({
    name: 'id',
    description: 'Project ID',
    example: 'proj_a1b2c3d4e5f6',
  })
  @ApiResponse({
    status: 200,
    description: 'Project paused successfully',
    type: PauseResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Project not found or sandbox not active',
    schema: {
      example: {
        statusCode: 404,
        message: 'Project not found',
        error: 'Not Found',
      },
    },
  })
  @ApiResponse({
    status: 502,
    description: 'Python backend error - sandbox pause failed',
    schema: {
      example: {
        statusCode: 502,
        message: 'Failed to pause project: Sandbox not found in cache',
        error: 'Bad Gateway',
      },
    },
  })
  async pauseProject(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<PauseResponseDto> {
    try {
      const userId = this.extractUserId(req);
      this.logger.log(`Pausing project ${id} for user ${userId}`);

      return await this.projectsService.pauseProject(id, userId);
    } catch (error) {
      this.logger.error(`Pause project error: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Failed to pause project',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // DELETE /projects/:id - Delete project
  // ============================================================

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete project',
    description:
      'Permanently delete a project and its associated sandbox. This action cannot be undone. All project data, assets, and conversation history will be removed.',
  })
  @ApiParam({
    name: 'id',
    description: 'Project ID',
    example: 'proj_a1b2c3d4e5f6',
  })
  @ApiOkResponse({
    description: 'Project deleted successfully',
    type: DeleteProjectResponseDto,
    schema: {
      example: {
        success: true,
        message: 'Project deleted successfully',
        project_id: 'proj_a1b2c3d4e5f6',
        deleted_at: '2026-01-26T10:45:00Z',
        sandbox_cleanup_status: 'deferred',
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Project not found',
    schema: {
      example: {
        statusCode: 404,
        message: 'Project not found',
        error: 'Not Found',
      },
    },
  })
  async deleteProject(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<DeleteProjectResponseDto> {
    try {
      const userId = this.extractUserId(req);
      this.logger.log(`Deleting project ${id} for user ${userId}`);

      return await this.projectsService.deleteProject(id, userId);
    } catch (error) {
      this.logger.error(`Delete project error: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Failed to delete project',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
