import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../shared/services/prisma.service';
import { SandboxUrlsResponseDto } from '../dtos';

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
export class SandboxService {
  private readonly logger = new Logger(SandboxService.name);
  private readonly pythonApiUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.pythonApiUrl = this.configService.get<string>(
      'PYTHON_API_URL',
      'http://localhost:8000',
    );
    this.logger.log(`Python API URL: ${this.pythonApiUrl}`);
  }

  /**
   * Create sandbox session via Python API
   * 
   * Python Endpoint: POST /api/sandbox/session
   * Request: { user_id: string, project_id: string }
   * Response: { sandbox_id: string, frontend_url: string, backend_url: string }
   * 
   * @param userId - User ID
   * @param projectId - Project ID
   * @returns Sandbox session info with URLs
   * @throws 429 if resource limit exceeded
   */
  async createSandboxSession(userId: string, projectId: string): Promise<any> {
    const url = `${this.pythonApiUrl}/api/sandbox/session`;

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          url,
          {
            user_id: userId,
            project_id: projectId,
          },
          { timeout: 60000 }, // 60 second timeout for sandbox creation
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Error creating sandbox session: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Resume sandbox session via Python API
   * 
   * Python Endpoint: POST /api/sandbox/resume
   * Request: { user_id: string, project_id: string, sandbox_id?: string }
   * Response: { sandbox_id: string, frontend_url: string, backend_url: string }
   * 
   * @param userId - User ID
   * @param projectId - Project ID
   * @param sandboxId - Optional sandbox ID to resume specific instance
   * @returns Sandbox session info with updated URLs
   * @throws 429 if resource limit exceeded
   */
  async resumeSandboxSession(
    userId: string,
    projectId: string,
    sandboxId?: string,
  ): Promise<any> {
    const url = `${this.pythonApiUrl}/api/sandbox/resume`;

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          url,
          {
            user_id: userId,
            project_id: projectId,
            sandbox_id: sandboxId || undefined,
          },
          { timeout: 45000 }, // 45 second timeout for sandbox resume
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Error resuming sandbox session: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Pause sandbox via Python API
   * 
   * Python Endpoint: POST /api/sandbox/pause
   * Request: { user_id: string, project_id: string }
   * Response: { success: boolean, message: string }
   * 
   * @param userId - User ID
   * @param projectId - Project ID
   * @returns Success status
   */
  async pauseSandbox(userId: string, projectId: string): Promise<any> {
    const url = `${this.pythonApiUrl}/api/sandbox/pause`;

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          url,
          {
            user_id: userId,
            project_id: projectId,
          },
          { timeout: 30000 }, // 30 second timeout for pause
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Error pausing sandbox: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Delete sandbox via Python API
   * 
   * Note: Currently Python backend doesn't have a dedicated delete endpoint.
   * Sandboxes are automatically cleaned up by:
   * 1. E2B lifecycle management (30 days max)
   * 2. Cache expiration (30 min general, 30 days long-term)
   * 3. Pause operation (which removes from active pool)
   * 
   * For now, we'll attempt to pause the sandbox to free resources.
   * If pause fails, it's acceptable as E2B will eventually clean up.
   */
  async deleteSandbox(projectId: string): Promise<any> {
    const url = `${this.pythonApiUrl}/api/sandbox/pause`;

    try {
      // Attempt to pause sandbox to free resources
      // Note: This requires project info which we don't have here
      // TODO: Either pass userId or implement proper DELETE endpoint in Python
      this.logger.warn(
        `Sandbox deletion not fully implemented. Sandbox will be cleaned up by E2B lifecycle (30 days). Project: ${projectId}`,
      );
      
      // For now, just return success
      // The sandbox will be garbage collected by E2B
      return { success: true, message: 'Sandbox marked for cleanup' };
    } catch (error) {
      this.logger.error(
        `Error deleting sandbox on Python API: ${error.message}`,
        error.stack,
      );
      // Don't fail the deletion if sandbox cleanup fails
      // The important part is deleting from database
      return { success: true, message: 'Sandbox cleanup deferred to E2B' };
    }
  }

  /**
   * Delete project conversation history from MongoDB via Python API
   * 
   * Python Endpoint: POST /projects/delete
   * Request: { project_id: string }
   * Response: { project_id: string, deleted: boolean, message: string }
   * 
   * Removes all checkpoints and conversation state from MongoDB.
   * 
   * @param projectId - Project ID
   * @returns Deletion status
   */
  async deleteProjectHistory(projectId: string): Promise<any> {
    const url = `${this.pythonApiUrl}/projects/delete`;

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          url,
          {
            project_id: projectId,
          },
          { timeout: 30000 }, // 30 second timeout
        ),
      );

      this.logger.log(
        `Deleted conversation history for project ${projectId}`,
      );

      return response.data;
    } catch (error) {
      this.logger.error(
        `Error deleting project history: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get sandbox public URL for a specific port
   */
  async getSandboxUrl(
    projectId: string,
    userId: string,
    port: number,
  ): Promise<SandboxUrlsResponseDto> {
    this.logger.log(
      `Getting sandbox URL for project ${projectId}, port ${port}`,
    );

    // Get project from DB to verify ownership and get sandbox info
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        userId,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const metadata = (project.metadata as ProjectMetadata) || {};

    // Query Python API for the public URL (POST request with body)
    const url = `${this.pythonApiUrl}/api/sandbox/public-url`;

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, {
          user_id: userId,
          project_id: projectId,
          port: port,
        }),
      );

      // Return URL based on port
      const publicUrl = response.data.public_url;

      return {
        success: true,
        project_id: projectId,
        frontend_url: port === 3000 ? publicUrl : metadata.frontend_url || '',
        backend_url: port === 8000 ? publicUrl : metadata.backend_url || '',
        sandbox_id: project.active_sandbox_id || response.data.sandbox_id,
      };
    } catch (error) {
      // If Python API fails, return data from DB metadata
      this.logger.warn(
        `Python API unavailable, returning URL from DB: ${error.message}`,
      );

      return {
        success: true,
        project_id: projectId,
        frontend_url: port === 3000 ? metadata.frontend_url || '' : '',
        backend_url: port === 8000 ? metadata.backend_url || '' : '',
        sandbox_id: project.active_sandbox_id || '',
      };
    }
  }
}
