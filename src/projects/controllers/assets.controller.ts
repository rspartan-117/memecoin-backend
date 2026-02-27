import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Req,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  HttpStatus,
  Logger,
  UseGuards,
  HttpException,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { AssetsService } from '../services/assets.service';
import {
  UploadDocumentResponseDto,
  UploadImageResponseDto,
  AssetListResponseDto,
  DeleteAssetResponseDto,
  BatchUploadDocumentsResponseDto,
} from '../dtos';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';

@ApiTags('Projects - Assets')
@Controller('projects/:projectId/assets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class AssetsController {
  private readonly logger = new Logger(AssetsController.name);

  constructor(private readonly assetsService: AssetsService) {}

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
  // POST /projects/:projectId/assets/documents - Upload document
  // ============================================================

  @Post('documents')
  @ApiOperation({
    summary: 'Upload document',
    description: 'Upload and process a document (PDF, code files, etc.)',
  })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Document file to upload',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Document uploaded and processed successfully',
    type: UploadDocumentResponseDto,
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadDocumentResponseDto> {
    this.logger.log(`========== UPLOAD DOCUMENT REQUEST START ==========`);
    this.logger.log(`Project ID: ${projectId}`);

    try {
      if (!file) {
        this.logger.error('No file provided in request');
        throw new BadRequestException('No file provided');
      }

      this.logger.log(`File received: ${file.originalname}`);
      this.logger.log(`File size: ${file.size} bytes`);
      this.logger.log(`File mimetype: ${file.mimetype}`);
      this.logger.log(`File encoding: ${file.encoding}`);

      const userId = this.extractUserId(req);
      this.logger.log(`User ID extracted: ${userId}`);

      this.logger.log(`Calling assetsService.uploadDocument...`);
      const result = await this.assetsService.uploadDocument(
        projectId,
        userId,
        file,
      );

      this.logger.log(`Upload successful: ${JSON.stringify(result)}`);
      this.logger.log(`========== UPLOAD DOCUMENT REQUEST END ==========`);
      return result;
    } catch (error) {
      this.logger.error(`========== UPLOAD DOCUMENT REQUEST FAILED ==========`);
      this.logger.error(`Error type: ${error.constructor.name}`);
      this.logger.error(`Error message: ${error.message}`);
      this.logger.error(`Error status: ${error.status || 'N/A'}`);

      if (error.response) {
        this.logger.error(`HTTP Response status: ${error.response.status}`);
        this.logger.error(
          `HTTP Response data: ${JSON.stringify(error.response.data, null, 2)}`,
        );
      }

      this.logger.error(`Stack trace: ${error.stack}`);

      throw new HttpException(
        error.message || 'Failed to upload document',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // POST /projects/:projectId/assets/documents/batch - Batch upload documents
  // ============================================================

  @Post('documents/batch')
  @ApiOperation({
    summary: 'Batch upload documents',
    description:
      'Upload and process multiple documents at once (optimized for performance)',
  })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
          description: 'Multiple document files to upload',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Documents batch uploaded and processed',
    type: BatchUploadDocumentsResponseDto,
  })
  @UseInterceptors(FilesInterceptor('files', 50)) // Max 50 files per batch
  async uploadDocumentsBatch(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<BatchUploadDocumentsResponseDto> {
    this.logger.log(
      `========== BATCH UPLOAD DOCUMENTS REQUEST START ==========`,
    );
    this.logger.log(`Project ID: ${projectId}`);
    this.logger.log(`Number of files: ${files?.length || 0}`);

    try {
      if (!files || files.length === 0) {
        this.logger.error('No files provided in batch request');
        throw new BadRequestException('No files provided');
      }

      this.logger.log(
        `Files received: ${files.map((f) => f.originalname).join(', ')}`,
      );
      this.logger.log(
        `Total size: ${files.reduce((sum, f) => sum + f.size, 0)} bytes`,
      );

      const userId = this.extractUserId(req);
      this.logger.log(`User ID extracted: ${userId}`);

      this.logger.log(`Calling assetsService.uploadDocumentsBatch...`);
      const result = await this.assetsService.uploadDocumentsBatch(
        projectId,
        userId,
        files,
      );

      this.logger.log(
        `Batch upload complete: ${result.successful}/${result.total_documents} successful`,
      );
      this.logger.log(
        `========== BATCH UPLOAD DOCUMENTS REQUEST END ==========`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `========== BATCH UPLOAD DOCUMENTS REQUEST FAILED ==========`,
      );
      this.logger.error(`Error type: ${error.constructor.name}`);
      this.logger.error(`Error message: ${error.message}`);
      this.logger.error(`Error status: ${error.status || 'N/A'}`);

      if (error.response) {
        this.logger.error(`HTTP Response status: ${error.response.status}`);
        this.logger.error(
          `HTTP Response data: ${JSON.stringify(error.response.data, null, 2)}`,
        );
      }

      this.logger.error(`Stack trace: ${error.stack}`);

      throw new HttpException(
        error.message || 'Failed to batch upload documents',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // POST /projects/:projectId/assets/images - Upload image
  // ============================================================

  @Post('images')
  @ApiOperation({
    summary: 'Upload image',
    description: 'Upload and process an image file',
  })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image file to upload',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Image uploaded and processed successfully',
    type: UploadImageResponseDto,
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadImageResponseDto> {
    this.logger.log(`========== UPLOAD IMAGE REQUEST START ==========`);
    this.logger.log(`Project ID: ${projectId}`);

    try {
      if (!file) {
        this.logger.error('No file provided in request');
        throw new BadRequestException('No file provided');
      }

      this.logger.log(`File received: ${file.originalname}`);
      this.logger.log(`File size: ${file.size} bytes`);
      this.logger.log(`File mimetype: ${file.mimetype}`);
      this.logger.log(`File encoding: ${file.encoding}`);

      const userId = this.extractUserId(req);
      this.logger.log(`User ID extracted: ${userId}`);

      this.logger.log(`Calling assetsService.uploadImage...`);
      const result = await this.assetsService.uploadImage(
        projectId,
        userId,
        file,
      );

      this.logger.log(`Upload successful: ${JSON.stringify(result)}`);
      this.logger.log(`========== UPLOAD IMAGE REQUEST END ==========`);
      return result;
    } catch (error) {
      this.logger.error(`========== UPLOAD IMAGE REQUEST FAILED ==========`);
      this.logger.error(`Error type: ${error.constructor.name}`);
      this.logger.error(`Error message: ${error.message}`);
      this.logger.error(`Error status: ${error.status || 'N/A'}`);

      if (error.response) {
        this.logger.error(`HTTP Response status: ${error.response.status}`);
        this.logger.error(
          `HTTP Response data: ${JSON.stringify(error.response.data, null, 2)}`,
        );
      }

      this.logger.error(`Stack trace: ${error.stack}`);

      throw new HttpException(
        error.message || 'Failed to upload image',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // GET /projects/:projectId/assets - List project assets
  // ============================================================

  @Get()
  @ApiOperation({
    summary: 'List project assets',
    description: 'Get all assets (documents and images) for a project',
  })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: 200,
    description: 'Assets retrieved successfully',
    type: AssetListResponseDto,
  })
  async listAssets(
    @Req() req: Request,
    @Param('projectId') projectId: string,
  ): Promise<AssetListResponseDto> {
    try {
      const userId = this.extractUserId(req);
      this.logger.log(
        `Listing assets for project ${projectId}, user ${userId}`,
      );

      return await this.assetsService.listAssets(projectId, userId);
    } catch (error) {
      this.logger.error(`List assets error: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Failed to list assets',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // DELETE /projects/:projectId/assets - Delete all project assets
  // ============================================================

  @Delete()
  @ApiOperation({
    summary: 'Delete all project assets',
    description: 'Delete all assets associated with a project from S3 and database',
  })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: 200,
    description: 'All project assets deleted successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        deletedCount: { type: 'number', example: 5 },
        s3DeletedCount: { type: 'number', example: 5 },
        errors: { type: 'array', items: { type: 'string' }, example: [] },
      },
    },
  })
  async deleteAllProjectAssets(
    @Req() req: Request,
    @Param('projectId') projectId: string,
  ) {
    try {
      const userId = this.extractUserId(req);
      this.logger.log(
        `Deleting all assets for project ${projectId}, user ${userId}`,
      );

      return await this.assetsService.deleteAllProjectAssets(projectId, userId);
    } catch (error) {
      this.logger.error(`Delete all project assets error: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Failed to delete project assets',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // DELETE /projects/:projectId/assets/:assetId - Delete asset
  // ============================================================

  @Delete(':assetId')
  @ApiOperation({
    summary: 'Delete asset',
    description: 'Delete an asset from the project',
  })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'assetId', description: 'Asset ID' })
  @ApiResponse({
    status: 200,
    description: 'Asset deleted successfully',
    type: DeleteAssetResponseDto,
  })
  async deleteAsset(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Param('assetId') assetId: string,
  ): Promise<DeleteAssetResponseDto> {
    try {
      const userId = this.extractUserId(req);
      this.logger.log(
        `Deleting asset ${assetId} from project ${projectId}, user ${userId}`,
      );

      return await this.assetsService.deleteAsset(projectId, userId, assetId);
    } catch (error) {
      this.logger.error(`Delete asset error: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Failed to delete asset',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
