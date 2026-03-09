import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { Octokit } from 'octokit';
import { PrismaService } from '../../shared/services/prisma.service';
import { SandboxService } from './sandbox.service';
import { AssetsService } from './assets.service';
import { DeployService } from '../../deployment/services/deploy.service';
import {
  CreateProjectDto,
  ProjectResponseDto,
  ProjectsListResponseDto,
  ResumeProjectResponseDto,
  DeleteProjectResponseDto,
} from '../dtos';

interface ProjectMetadata {
  frontend_url?: string;
  backend_url?: string;
  documents?: Array<{
    asset_id: string;
    filename: string;
    s3_url: string;
    file_type: string;
    language?: string;
    is_code_file: boolean;
    summary?: string;
    total_chunks?: number;
    token_count?: number;
    rag_processed: boolean;
    added_at: string;
  }>;
  images?: Array<{
    asset_id: string;
    filename: string;
    s3_url: string;
    image_url: string;
    analysis?: string;
    rag_processed: boolean;
    added_at: string;
  }>;
  conversationHistory?: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    timestamp: Date;
  }>;
}

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);
  private readonly githubToken: string | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sandboxService: SandboxService,
    private readonly assetsService: AssetsService,
    private readonly deployService: DeployService,
    private readonly configService: ConfigService,
  ) {
    this.githubToken =
      process.env.GITHUB_TOKEN ||
      this.configService.get<string>('GITHUB_TOKEN') ||
      null;
    if (!this.githubToken) {
      this.logger.warn(
        'GITHUB_TOKEN not set — GitHub repo cleanup on project delete will be skipped',
      );
    }
  }

  /**
   * Generate a new project ID
   */
  generateProjectId(): string {
    return `proj_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
  }

  /**
   * Create a new project
   */
  async createProject(
    userId: string,
    dto: CreateProjectDto,
  ): Promise<ProjectResponseDto> {
    const projectId = this.generateProjectId();

    this.logger.log(`Creating project ${projectId} for user ${userId}`);

    try {
      // 1. Create sandbox via Sandbox Service
      const sandboxResponse = await this.sandboxService.createSandboxSession(
        userId,
        projectId,
      );

      // 2. Create project in database with sandbox info
      const project = await this.prisma.project.create({
        data: {
          id: projectId,
          userId,
          name: dto.name,
          description: dto.description,
          type: dto.type || 'LANDING_PAGE',
          active_sandbox_id: sandboxResponse.sandbox_id,
          sandbox_state: 'RUNNING',
          status: 'ACTIVE',
          metadata: {
            frontend_url: sandboxResponse.frontend_url,
            backend_url: sandboxResponse.backend_url,
            conversationHistory: [],
          },
        },
      });

      return this.formatProjectResponse(project, sandboxResponse);
    } catch (error) {
      this.logger.error(
        `Error creating project: ${error.message}`,
        error.stack,
      );

      // Handle Python backend 429 (resource limit exceeded)
      if (error.response?.status === 429) {
        throw new HttpException(
          error.response?.data?.message ||
            'Resource limit exceeded: Too many active sandboxes. Please pause or delete an existing project.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      throw new HttpException(
        `Failed to create project: ${error.message}`,
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get all projects for a user
   */
  async findAll(
    userId: string,
    limit = 50,
    offset = 0,
  ): Promise<ProjectsListResponseDto> {
    this.logger.log(`Fetching projects for user ${userId}`);

    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({
        where: { userId },
        orderBy: { last_active: 'desc' },
        take: limit,
        skip: offset,
        include: {
          deployment: true,
        },
      }),
      this.prisma.project.count({ where: { userId } }),
    ]);

    return {
      projects: projects.map((p) => this.formatProjectResponse(p)),
      total,
      limit,
      offset,
    };
  }

  /**
   * Get a single project by ID
   */
  async findOne(
    projectId: string,
    userId: string,
  ): Promise<ProjectResponseDto> {
    this.logger.log(`Fetching project ${projectId} for user ${userId}`);

    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        userId,
      },
      include: {
        deployment: true,
        user: {
          select: {
            githubUsername: true,
            githubToken: true,
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return this.formatProjectResponse(project);
  }

  /**
   * Resume an existing project
   */
  async resumeProject(
    projectId: string,
    userId: string,
  ): Promise<ResumeProjectResponseDto> {
    this.logger.log(`Resuming project ${projectId} for user ${userId}`);

    // 1. Get project from DB
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        userId,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const previousState = project.sandbox_state;

    try {
      // 2. Resume/reconnect sandbox via Sandbox Service
      const sandboxResponse = await this.sandboxService.resumeSandboxSession(
        userId,
        projectId,
        project.active_sandbox_id ?? undefined,
      );

      // Get existing URLs from metadata
      const existingMetadata = (project.metadata as ProjectMetadata) || {};
      const existingFrontendUrl = existingMetadata.frontend_url;
      const existingBackendUrl = existingMetadata.backend_url;

      // Determine final URLs (use new ones if provided, otherwise keep existing)
      const finalFrontendUrl = sandboxResponse.frontend_url || existingFrontendUrl;
      const finalBackendUrl = sandboxResponse.backend_url || existingBackendUrl;

      // 3. Update DB state
      // Note: We preserve the existing status here. Status should only be changed by chat endpoint:
      //   - ACTIVE when user sends a message
      //   - ENDED when stream completes
      const updatedProject = await this.prisma.project.update({
        where: { id: projectId },
        data: {
          sandbox_state: 'RUNNING',
          // Keep existing status (don't force to ACTIVE - let chat endpoint handle that)
          active_sandbox_id: sandboxResponse.sandbox_id,
          last_active: new Date(),
          metadata: {
            ...existingMetadata,
            // Only update URLs if new ones are provided, otherwise preserve existing
            frontend_url: finalFrontendUrl,
            backend_url: finalBackendUrl,
          },
        },
      });

      return {
        success: true,
        message: 'Project resumed successfully',
        project_id: projectId,
        sandbox_id: sandboxResponse.sandbox_id,
        previous_state: previousState,
        current_state: 'RUNNING',
        frontend_url: finalFrontendUrl,
        backend_url: finalBackendUrl,
        resumed_at: updatedProject.last_active,
      };
    } catch (error) {
      this.logger.error(
        `Error resuming project: ${error.message}`,
        error.stack,
      );

      // Handle Python backend 429 (resource limit exceeded)
      if (error.response?.status === 429) {
        throw new HttpException(
          error.response?.data?.message ||
            'Resource limit exceeded: Too many active sandboxes. Please pause or delete an existing project.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      throw new HttpException(
        `Failed to resume project: ${error.message}`,
        error.response?.status || HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * Pause a project sandbox
   */
  async pauseProject(projectId: string, userId: string): Promise<any> {
    this.logger.log(`Pausing project ${projectId} for user ${userId}`);

    // 1. Verify project exists and belongs to user
    await this.findOne(projectId, userId);

    try {
      // 2. Pause via Sandbox Service
      await this.sandboxService.pauseSandbox(userId, projectId);

      // 3. Update DB
      await this.prisma.project.update({
        where: { id: projectId },
        data: {
          sandbox_state: 'PAUSED',
          status: 'PAUSED',
          last_active: new Date(),
        },
      });

      return {
        success: true,
        message: 'Project paused successfully',
        projectId,
      };
    } catch (error) {
      this.logger.error(`Error pausing project: ${error.message}`, error.stack);
      throw new HttpException(
        `Failed to pause project: ${error.message}`,
        error.response?.status || HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * Delete a project and tear down ALL associated resources:
   *   1. Deployment cloud resources (Koyeb app + SaaS Custom Domain)
   *   2. GitHub repositories (deployment's + project's own)
   *   3. E2B sandbox
   *   4. S3 assets
   *   5. MongoDB conversation history
   *   6. PostgreSQL records (cascade: Deployment, ProjectFile, ProjectThought, Asset)
   */
  async deleteProject(
    projectId: string,
    userId: string,
  ): Promise<DeleteProjectResponseDto> {
    this.logger.log(`Deleting project ${projectId} for user ${userId}`);

    // 1. Verify project exists and belongs to user
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    let sandboxCleanupStatus: 'completed' | 'deferred' | 'failed' = 'deferred';
    let assetsCleanupStatus: 'completed' | 'failed' = 'completed';
    let deploymentCleanupStatus: 'completed' | 'skipped' | 'failed' = 'skipped';

    // 2. Tear down deployment cloud resources (Koyeb app + SaaS Custom Domain)
    const deployment = await this.prisma.deployment.findFirst({
      where: { projectId },
    });

    if (deployment && deployment.status !== 'DELETED') {
      try {
        await this.deployService.terminateDeploymentById({
          id: deployment.id,
          frontendAppName: deployment.frontendAppName,
          saascdUpstreamUuid: deployment.saascdUpstreamUuid,
          saascdDomainUuid: deployment.saascdDomainUuid,
        });
        deploymentCleanupStatus = 'completed';
        this.logger.log(
          `Deployment ${deployment.id} cloud resources torn down`,
        );
      } catch (error) {
        this.logger.warn(
          `Deployment teardown failed, continuing with project deletion: ${error.message}`,
        );
        deploymentCleanupStatus = 'failed';
      }

      // Delete deployment's GitHub repo
      if (deployment.githubRepoUrl) {
        await this.deleteGithubRepo(deployment.githubRepoUrl);
      }
    }

    // 3. Delete project's own GitHub repo (if different from deployment's)
    if (
      project.githubRepoUrl &&
      project.githubRepoUrl !== deployment?.githubRepoUrl
    ) {
      await this.deleteGithubRepo(project.githubRepoUrl);
    }

    // 4. Attempt to delete/cleanup E2B sandbox via Sandbox Service
    try {
      const sandboxResult = await this.sandboxService.deleteSandbox(projectId);
      sandboxCleanupStatus = sandboxResult.success ? 'deferred' : 'failed';
    } catch (error) {
      this.logger.warn(
        `Sandbox cleanup failed, will rely on E2B lifecycle: ${error.message}`,
      );
      sandboxCleanupStatus = 'failed';
    }

    // 5. Delete all project assets from S3
    try {
      await this.assetsService.deleteAllProjectAssets(projectId, userId);
      this.logger.log(`Deleted all assets for project ${projectId}`);
    } catch (error) {
      this.logger.warn(
        `Failed to delete project assets, continuing with project deletion: ${error.message}`,
      );
      assetsCleanupStatus = 'failed';
    }

    // 6. Delete conversation history from MongoDB (checkpoints)
    try {
      await this.sandboxService.deleteProjectHistory(projectId);
      this.logger.log(`Deleted conversation history for project ${projectId}`);
    } catch (error) {
      this.logger.warn(
        `Failed to delete conversation history, continuing with project deletion: ${error.message}`,
      );
    }

    // 7. Delete from DB (cascade handles Deployment, ProjectFile, ProjectThought, Asset records)
    try {
      await this.prisma.project.delete({
        where: { id: projectId },
      });

      this.logger.log(
        `Project ${projectId} fully deleted (deployment + sandbox + assets + history + DB)`,
      );

      return {
        success: true,
        message: 'Project deleted successfully',
        project_id: projectId,
        deleted_at: new Date(),
        sandbox_cleanup_status: sandboxCleanupStatus,
        assets_cleanup_status: assetsCleanupStatus,
        deployment_cleanup_status: deploymentCleanupStatus,
      };
    } catch (error) {
      this.logger.error(
        `Error deleting project: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        `Failed to delete project: ${error.message}`,
        error.response?.status || HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * Delete a GitHub repository by URL.
   * Non-throwing — logs warnings on failure so the rest of the deletion can proceed.
   */
  private async deleteGithubRepo(repoUrl: string): Promise<void> {
    if (!this.githubToken) {
      this.logger.warn(
        `Skipping GitHub repo deletion — GITHUB_TOKEN not configured`,
      );
      return;
    }
    try {
      const octokit = new Octokit({ auth: this.githubToken });
      const urlParts = repoUrl.replace(/\.git$/, '').split('/');
      const repo = urlParts.pop();
      const owner = urlParts.pop();
      if (owner && repo) {
        await octokit.request('DELETE /repos/{owner}/{repo}', { owner, repo });
        this.logger.log(`GitHub repo ${owner}/${repo} deleted`);
      }
    } catch (err) {
      this.logger.warn(
        `Failed to delete GitHub repo ${repoUrl}: ${err.message}`,
      );
    }
  }

  /**
   * Update project status
   * Used by chat endpoint to track session lifecycle
   * 
   * @param projectId - Project ID
   * @param status - New status (ACTIVE | ENDED | PAUSED)
   */
  async updateProjectStatus(
    projectId: string,
    status: 'ACTIVE' | 'ENDED' | 'PAUSED',
  ): Promise<void> {
    this.logger.log(`Updating project ${projectId} status to ${status}`);

    const updateData: any = {
      status,
      last_active: new Date(),
    };

    // Set ended_at timestamp when marking as ENDED
    if (status === 'ENDED') {
      updateData.ended_at = new Date();
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: updateData,
    });
  }

  /**
   * Format project response with metadata
   */
  private formatProjectResponse(
    project: any,
    sandboxInfo?: any,
  ): ProjectResponseDto {
    const metadata = (project.metadata as ProjectMetadata) || {};

    const response: any = {
      id: project.id,
      userId: project.userId,
      name: project.name,
      description: project.description,
      type: project.type,
      active_sandbox_id: project.active_sandbox_id,
      sandbox_state: project.sandbox_state,
      status: project.status,
      frontend_url: sandboxInfo?.frontend_url || metadata.frontend_url,
      backend_url: sandboxInfo?.backend_url || metadata.backend_url,
      metadata: project.metadata,
      created_at: project.created_at,
      updated_at: project.updated_at,
      last_active: project.last_active,
      githubRepoUrl: project.githubRepoUrl,
    };

    // Add user GitHub information if it exists
    if (project.user) {
      response.githubUsername = project.user.githubUsername;
    }

    // Add deployment information if it exists
    if (project.deployment) {
      response.deployment = {
        id: project.deployment.id,
        status: project.deployment.status,
        backendUrl: project.deployment.backendUrl,
        frontendUrl: project.deployment.frontendUrl,
        githubRepoUrl: project.deployment.githubRepoUrl,
        screenshotUrl: project.deployment.screenshotUrl,
        customDomain: project.deployment.customDomain,
        domainStatus: project.deployment.domainStatus,
        deployedAt: project.deployment.deployedAt,
        backendAppName: project.deployment.backendAppName,
        frontendAppName: project.deployment.frontendAppName,
        projectType: project.deployment.projectType,
        visibility: project.deployment.visibility,
        createdAt: project.deployment.createdAt,
        updatedAt: project.deployment.updatedAt,
      };
    }

    return response;
  }
}
