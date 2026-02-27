import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  DownloadResponseDto,
  ListZipsResponseDto,
  CleanupResponseDto,
} from '../dtos';

@Injectable()
export class DownloadService {
  private readonly logger = new Logger(DownloadService.name);
  private readonly pythonApiUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.pythonApiUrl = this.configService.get<string>(
      'PYTHON_API_URL',
      'http://localhost:8000',
    );
    this.logger.log(`Python API URL: ${this.pythonApiUrl}`);
  }

  /**
   * Create ZIP download
   */
  async createDownload(
    projectId: string,
    userId: string,
    sourcePath?: string,
    zipName?: string,
    excludePatterns?: string[],
    useDefaults: boolean = true,
    urlExpiration?: number,
  ): Promise<DownloadResponseDto> {
    const url = `${this.pythonApiUrl}/api/projects/download`;

    this.logger.log(`Creating download for project ${projectId}`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          url,
          {
            user_id: userId,
            project_id: projectId,
            source_path: sourcePath || null,
            zip_name: zipName || null,
            exclude_patterns: excludePatterns || null,
            use_defaults: useDefaults,
            url_expiration: urlExpiration || null,
          },
          { timeout: 180000 }, // 3 minutes for ZIP creation
        ),
      );

      this.logger.debug(`Response: ${JSON.stringify(response.data)}`);
      return response.data;
    } catch (error) {
      this.logger.error(
        `Error creating download: ${error.message}`,
        error.stack,
      );

      // Parse Python error detail
      const detail = error.response?.data?.detail || error.message;
      const status = error.response?.status || HttpStatus.BAD_GATEWAY;

      throw new HttpException(`Failed to create download: ${detail}`, status);
    }
  }

  /**
   * List ZIP files
   */
  async listZips(
    projectId: string,
    userId: string,
  ): Promise<ListZipsResponseDto> {
    const url = `${this.pythonApiUrl}/api/projects/list-zips`;

    this.logger.log(`Listing ZIPs for project ${projectId}`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          url,
          {
            user_id: userId,
            project_id: projectId,
          },
          { timeout: 60000 }, // 1 minute for listing
        ),
      );

      this.logger.debug(`Response: ${JSON.stringify(response.data)}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Error listing ZIPs: ${error.message}`, error.stack);

      // Parse Python error detail
      const detail = error.response?.data?.detail || error.message;
      const status = error.response?.status || HttpStatus.BAD_GATEWAY;

      throw new HttpException(`Failed to list ZIPs: ${detail}`, status);
    }
  }

  /**
   * Cleanup ZIP files
   */
  async cleanupZips(
    projectId: string,
    userId: string,
    sandboxPath?: string,
  ): Promise<CleanupResponseDto> {
    const url = `${this.pythonApiUrl}/api/projects/cleanup`;

    this.logger.log(
      `Cleaning up ZIPs for project ${projectId}, path: ${sandboxPath || 'ALL'}`,
    );

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          url,
          {
            user_id: userId,
            project_id: projectId,
            sandbox_path: sandboxPath || null,
          },
          { timeout: 60000 }, // 1 minute for cleanup
        ),
      );

      this.logger.debug(`Response: ${JSON.stringify(response.data)}`);
      return response.data;
    } catch (error) {
      this.logger.error(
        `Error cleaning up ZIPs: ${error.message}`,
        error.stack,
      );

      // Parse Python error detail
      const detail = error.response?.data?.detail || error.message;
      const status = error.response?.status || HttpStatus.BAD_GATEWAY;

      throw new HttpException(`Failed to cleanup ZIPs: ${detail}`, status);
    }
  }
}
