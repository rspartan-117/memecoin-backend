import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../shared/services/prisma.service';
import { S3UrlService } from '../../shared/services/s3-url.service';
import {
  UploadDocumentResponseDto,
  UploadImageResponseDto,
  AssetListResponseDto,
  BatchUploadDocumentsResponseDto,
  BatchDocumentResultDto,
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
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);
  private readonly pythonApiUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly s3UrlService: S3UrlService,
  ) {
    this.pythonApiUrl = this.configService.get<string>(
      'PYTHON_API_URL',
      'http://localhost:8000',
    );
    this.logger.log(`Python API URL: ${this.pythonApiUrl}`);
  }

  /**
   * Generate a new asset ID
   */
  generateAssetId(): string {
    return `asset_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
  }

  /**
   * Upload and process document
   */
  async uploadDocument(
    projectId: string,
    userId: string,
    file: Express.Multer.File,
  ): Promise<UploadDocumentResponseDto> {
    this.logger.log(
      `Uploading document ${file.originalname} for project ${projectId}`,
    );
    this.logger.debug(
      `File details: size=${file.size}, mimetype=${file.mimetype}`,
    );

    try {
      // 1. Upload to S3 (private)
      const s3Key = `projects/${projectId}/documents/${Date.now()}-${file.originalname}`;
      this.logger.debug(`S3 key: ${s3Key}`);

      await this.uploadFileToS3(s3Key, file.buffer, file.mimetype);
      
      // 2. Generate presigned URL for Python (2 hours for processing)
      const presignedUrl = await this.s3UrlService.getExternalApiUrl(s3Key, 7200);
      this.logger.debug(`Generated presigned URL for Python processing`);
      
      // 3. Get public URL for storage (metadata)
      const s3Url = this.s3UrlService.getPublicUrl(s3Key);
      this.logger.debug(`S3 URL: ${s3Url}`);

      // 4. Process via Python API with presigned URL
      const fileExtension = this.extractFileExtension(file.originalname);
      const payload = {
        document: {
          filename: file.originalname,
          filetype: fileExtension ? `.${fileExtension}` : '',
          metadata: {
            file_size: file.size,
            uploaded_at: new Date().toISOString(),
          },
          public_url: presignedUrl, // Use presigned URL for Python access
        },
        project_id: projectId,
        user_id: userId,
      };
      this.logger.debug(
        `Sending payload to Python API with presigned URL`,
      );

      const result = await this.processDocument(payload);

      if (!result.success) {
        throw new BadRequestException(
          result.message || 'Document processing failed',
        );
      }

      // 5. Store metadata in DB (use permanent S3 URL, not presigned)
      await this.addDocumentToProject(projectId, {
        asset_id: result.asset_id || this.generateAssetId(),
        filename: result.filename || file.originalname,
        s3_url: s3Url, // Store permanent S3 URL for reference
        file_type:
          result.file_type || this.extractFileExtension(file.originalname),
        language: result.language,
        is_code_file: result.is_code_file || false,
        summary: result.summary,
        total_chunks: result.total_chunks,
        token_count: result.token_count,
        rag_processed: result.rag_processed || false,
        added_at: new Date().toISOString(),
      });

      return result;
    } catch (error) {
      this.logger.error(
        `Error uploading document: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        `Failed to upload document: ${error.message}`,
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Upload and process image
   */
  async uploadImage(
    projectId: string,
    userId: string,
    file: Express.Multer.File,
  ): Promise<UploadImageResponseDto> {
    this.logger.log(
      `Uploading image ${file.originalname} for project ${projectId}`,
    );
    this.logger.debug(
      `File details: size=${file.size}, mimetype=${file.mimetype}`,
    );

    try {
      // 1. Upload to S3 (private)
      const s3Key = `projects/${projectId}/images/${Date.now()}-${file.originalname}`;
      this.logger.debug(`S3 key: ${s3Key}`);

      await this.uploadFileToS3(s3Key, file.buffer, file.mimetype);
      
      // 2. Generate presigned URL for Python (2 hours for processing)
      const presignedUrl = await this.s3UrlService.getExternalApiUrl(s3Key, 7200);
      this.logger.debug(`Generated presigned URL for Python processing`);
      
      // 3. Get public URL for storage (metadata)
      const s3Url = this.s3UrlService.getPublicUrl(s3Key);
      this.logger.debug(`S3 URL: ${s3Url}`);

      // 4. Process via Python API with presigned URL
      const fileExtension = this.extractFileExtension(file.originalname);
      const payload = {
        s3_url: presignedUrl, // Direct field, not nested
        filename: file.originalname,
        project_id: projectId,
        content_type: file.mimetype, // Add content_type for Python
      };
      this.logger.debug(
        `Sending payload to Python API with presigned URL`,
      );

      const result = await this.processImage(payload);

      if (!result.success) {
        throw new BadRequestException(
          result.message || 'Image processing failed',
        );
      }

      // 5. Store metadata in DB (use permanent S3 URL, not presigned)
      await this.addImageToProject(projectId, {
        asset_id: result.asset_id || this.generateAssetId(),
        filename: result.filename || file.originalname,
        s3_url: s3Url, // Store permanent S3 URL for reference
        image_url: s3Url, // Store permanent URL
        analysis: result.analysis,
        rag_processed: result.rag_processed || false,
        added_at: new Date().toISOString(),
      });

      return result;
    } catch (error) {
      this.logger.error(`Error uploading image: ${error.message}`, error.stack);
      throw new HttpException(
        `Failed to upload image: ${error.message}`,
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Upload and process multiple documents in batch (optimized)
   */
  async uploadDocumentsBatch(
    projectId: string,
    userId: string,
    files: Express.Multer.File[],
  ): Promise<BatchUploadDocumentsResponseDto> {
    this.logger.log(
      `Batch uploading ${files.length} documents for project ${projectId}`,
    );

    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided for batch upload');
    }

    try {
      // Step 1: Upload all files to S3 in parallel (private)
      this.logger.debug(`Uploading ${files.length} files to S3 in parallel...`);
      const uploadPromises = files.map(async (file) => {
        const s3Key = `projects/${projectId}/documents/${Date.now()}-${Math.random().toString(36).substring(7)}-${file.originalname}`;
        await this.uploadFileToS3(s3Key, file.buffer, file.mimetype);
        
        // Generate presigned URL for Python (2 hours)
        const presignedUrl = await this.s3UrlService.getExternalApiUrl(s3Key, 7200);
        
        // Get permanent URL for storage
        const s3Url = this.s3UrlService.getPublicUrl(s3Key);

        return {
          file,
          s3Key,
          s3Url, // Permanent URL for DB
          presignedUrl, // Presigned URL for Python
        };
      });

      const uploadResults = await Promise.all(uploadPromises);
      this.logger.debug(`All ${uploadResults.length} files uploaded to S3`);

      // Step 2: Prepare documents for Python batch processing with presigned URLs
      const documents = uploadResults.map((result) => {
        const fileExtension = this.extractFileExtension(
          result.file.originalname,
        );
        return {
          filename: result.file.originalname,
          filetype: fileExtension ? `.${fileExtension}` : '',
          metadata: {
            file_size: result.file.size,
            uploaded_at: new Date().toISOString(),
          },
          public_url: result.presignedUrl, // Use presigned URL for Python
        };
      });

      // Step 3: Call Python batch processing endpoint
      const payload = {
        documents,
        project_id: projectId,
        user_id: userId,
      };

      this.logger.debug(
        `Sending batch processing request to Python API with ${documents.length} documents`,
      );
      const batchResult = await this.processBatchDocuments(payload);

      if (!batchResult.success && batchResult.successful === 0) {
        throw new BadRequestException(
          batchResult.message || 'Batch document processing failed',
        );
      }

      // Step 4: Store metadata in DB for successful documents
      const metadataPromises = batchResult.results
        .filter((result) => result.success)
        .map((result) =>
          this.addDocumentToProject(projectId, {
            asset_id: result.asset_id || this.generateAssetId(),
            filename: result.filename,
            s3_url: result.s3_url,
            file_type: result.file_type,
            language: result.language,
            is_code_file: result.is_code_file || false,
            summary: result.summary,
            total_chunks: result.total_chunks,
            token_count: result.token_count,
            rag_processed: result.rag_processed || false,
            added_at: new Date().toISOString(),
          }),
        );

      await Promise.all(metadataPromises);
      this.logger.log(
        `Batch upload complete: ${batchResult.successful}/${batchResult.total_documents} documents processed`,
      );

      return batchResult;
    } catch (error) {
      this.logger.error(
        `Error in batch document upload: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        `Failed to batch upload documents: ${error.message}`,
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * List all assets for a project
   */
  async listAssets(
    projectId: string,
    userId: string,
  ): Promise<AssetListResponseDto> {
    this.logger.log(`Listing assets for project ${projectId}`);

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

    return {
      documents: metadata.documents || [],
      images: metadata.images || [],
    };
  }

  /**
   * Delete an asset
   */
  async deleteAsset(
    projectId: string,
    userId: string,
    assetId: string,
  ): Promise<any> {
    this.logger.log(`Deleting asset ${assetId} from project ${projectId}`);

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

    // Find and remove the asset from metadata
    let assetFound = false;
    let s3Key: string | null = null;

    // Check in documents
    if (metadata.documents) {
      const documentIndex = metadata.documents.findIndex(
        (d) => d.asset_id === assetId,
      );
      if (documentIndex !== -1) {
        s3Key = this.s3UrlService.extractKeyFromUrl(
          metadata.documents[documentIndex].s3_url,
        );
        metadata.documents.splice(documentIndex, 1);
        assetFound = true;
      }
    }

    // Check in images
    if (!assetFound && metadata.images) {
      const imageIndex = metadata.images.findIndex(
        (i) => i.asset_id === assetId,
      );
      if (imageIndex !== -1) {
        s3Key = this.s3UrlService.extractKeyFromUrl(
          metadata.images[imageIndex].s3_url,
        );
        metadata.images.splice(imageIndex, 1);
        assetFound = true;
      }
    }

    if (!assetFound) {
      throw new NotFoundException('Asset not found');
    }

    // Update project metadata
    await this.prisma.project.update({
      where: { id: projectId },
      data: { metadata: metadata as any },
    });

    // Delete from S3 if key was found
    if (s3Key) {
      try {
        await this.s3UrlService.deleteFile(s3Key);
        this.logger.log(`Deleted S3 file: ${s3Key}`);
      } catch (error) {
        this.logger.warn(`Failed to delete S3 file: ${error.message}`);
      }
    }

    return {
      success: true,
      message: 'Asset deleted successfully',
      assetId,
    };
  }

  /**
   * Delete all assets for a user from S3 and database
   */
  async deleteAllUserAssets(userId: string): Promise<{
    success: boolean;
    deletedCount: number;
    s3DeletedCount: number;
    errors: string[];
  }> {
    this.logger.log(`Deleting all assets for user ${userId}`);

    const errors: string[] = [];
    let s3DeletedCount = 0;

    try {
      // Find all AI-generated assets with URLs
      const assets = await this.prisma.asset.findMany({
        where: {
          userId,
          source: 'AI_GENERATED',
          url: { not: null },
        },
      });

      this.logger.log(`Found ${assets.length} assets to delete for user ${userId}`);

      // Delete from S3
      for (const asset of assets) {
        if (asset.url) {
          try {
            const s3Key = this.s3UrlService.extractKeyFromUrl(asset.url);
            await this.s3UrlService.deleteFile(s3Key);
            s3DeletedCount++;
            this.logger.log(`Deleted S3 file for asset ${asset.id}: ${s3Key}`);
          } catch (error) {
            this.logger.warn(`Failed to delete S3 file for asset ${asset.id}: ${error.message}`);
            errors.push(`Asset ${asset.id}: ${error.message}`);
          }
        }
      }

      // Delete asset records from database
      const deleteResult = await this.prisma.asset.deleteMany({
        where: {
          userId,
          source: 'AI_GENERATED',
        },
      });

      return {
        success: true,
        deletedCount: deleteResult.count,
        s3DeletedCount,
        errors,
      };
    } catch (error) {
      this.logger.error(`Error deleting user assets: ${error.message}`, error.stack);
      throw new HttpException(
        `Failed to delete user assets: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Delete all assets for a project from S3 and database
   */
  async deleteAllProjectAssets(
    projectId: string,
    userId: string,
  ): Promise<{
    success: boolean;
    deletedCount: number;
    s3DeletedCount: number;
    errors: string[];
  }> {
    this.logger.log(`Deleting all assets for project ${projectId}`);

    const errors: string[] = [];
    let s3DeletedCount = 0;

    try {
      // Verify project exists and belongs to user
      const project = await this.prisma.project.findFirst({
        where: {
          id: projectId,
          userId,
        },
      });

      if (!project) {
        throw new NotFoundException('Project not found');
      }

      // Find all assets for the project
      const assets = await this.prisma.asset.findMany({
        where: {
          projectId,
          url: { not: null },
        },
      });

      this.logger.log(`Found ${assets.length} assets to delete for project ${projectId}`);

      // Delete from S3
      for (const asset of assets) {
        if (asset.url) {
          try {
            const s3Key = this.s3UrlService.extractKeyFromUrl(asset.url);
            await this.s3UrlService.deleteFile(s3Key);
            s3DeletedCount++;
            this.logger.log(`Deleted S3 file for asset ${asset.id}: ${s3Key}`);
          } catch (error) {
            this.logger.warn(`Failed to delete S3 file for asset ${asset.id}: ${error.message}`);
            errors.push(`Asset ${asset.id}: ${error.message}`);
          }
        }
      }

      // Delete asset records from database
      const deleteResult = await this.prisma.asset.deleteMany({
        where: {
          projectId,
        },
      });

      return {
        success: true,
        deletedCount: deleteResult.count,
        s3DeletedCount,
        errors,
      };
    } catch (error) {
      this.logger.error(`Error deleting project assets: ${error.message}`, error.stack);
      throw new HttpException(
        `Failed to delete project assets: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // Private helper methods
  // ============================================================

  /**
   * Upload file to S3
   */
  private async uploadFileToS3(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    try {
      this.logger.debug(
        `Uploading to S3: key=${key}, contentType=${contentType}, size=${buffer.length}`,
      );

      // Use uploadFromBase64 method with buffer converted to base64
      const base64Data = buffer.toString('base64');
      await this.s3UrlService.uploadFromBase64(
        key,
        base64Data,
        contentType,
        key.split('/').pop() || 'file',
      );

      this.logger.debug(`Successfully uploaded to S3: ${key}`);
    } catch (error) {
      this.logger.error(`Error uploading to S3: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Process document via Python API
   */
  private async processDocument(payload: any): Promise<any> {
    const url = `${this.pythonApiUrl}/assets/process-document`;
    this.logger.debug(`Calling Python API at: ${url}`);
    this.logger.debug(`Request payload: ${JSON.stringify(payload, null, 2)}`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, payload, {
          timeout: 120000, // 2 minutes timeout for document processing
        }),
      );
      this.logger.debug(`Response status: ${response.status}`);
      this.logger.debug(
        `Response data: ${JSON.stringify(response.data, null, 2)}`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Error processing document: ${error.message}`,
        error.stack,
      );

      // Log detailed error information
      if (error.response) {
        this.logger.error(`Response status: ${error.response.status}`);
        this.logger.error(
          `Response data: ${JSON.stringify(error.response.data, null, 2)}`,
        );
        this.logger.error(
          `Response headers: ${JSON.stringify(error.response.headers, null, 2)}`,
        );
      }

      if (error.config) {
        this.logger.error(`Request URL: ${error.config.url}`);
        this.logger.error(`Request method: ${error.config.method}`);
        this.logger.error(
          `Request data: ${JSON.stringify(error.config.data, null, 2)}`,
        );
      }

      throw error;
    }
  }

  /**
   * Process image via Python API
   */
  private async processImage(payload: any): Promise<any> {
    const url = `${this.pythonApiUrl}/assets/process-image`;
    this.logger.debug(`Calling Python API at: ${url}`);
    this.logger.debug(`Request payload: ${JSON.stringify(payload, null, 2)}`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, payload, {
          timeout: 120000, // 2 minutes timeout for image processing
        }),
      );
      this.logger.debug(`Response status: ${response.status}`);
      this.logger.debug(
        `Response data: ${JSON.stringify(response.data, null, 2)}`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Error processing image: ${error.message}`,
        error.stack,
      );

      // Log detailed error information
      if (error.response) {
        this.logger.error(`Response status: ${error.response.status}`);
        this.logger.error(
          `Response data: ${JSON.stringify(error.response.data, null, 2)}`,
        );
        this.logger.error(
          `Response headers: ${JSON.stringify(error.response.headers, null, 2)}`,
        );
      }

      if (error.config) {
        this.logger.error(`Request URL: ${error.config.url}`);
        this.logger.error(`Request method: ${error.config.method}`);
        this.logger.error(
          `Request data: ${JSON.stringify(error.config.data, null, 2)}`,
        );
      }

      throw error;
    }
  }

  /**
   * Process batch documents via Python API
   */
  private async processBatchDocuments(
    payload: any,
  ): Promise<BatchUploadDocumentsResponseDto> {
    const url = `${this.pythonApiUrl}/assets/process-documents`;
    this.logger.debug(`Calling Python batch API at: ${url}`);
    this.logger.debug(
      `Request payload: ${payload.documents.length} documents for project ${payload.project_id}`,
    );

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, payload, {
          timeout: 300000, // 5 minutes timeout for batch processing
        }),
      );
      this.logger.debug(`Response status: ${response.status}`);
      this.logger.debug(
        `Batch result: ${response.data.successful}/${response.data.total_documents} successful`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Error processing batch documents: ${error.message}`,
        error.stack,
      );

      // Log detailed error information
      if (error.response) {
        this.logger.error(`Response status: ${error.response.status}`);
        this.logger.error(
          `Response data: ${JSON.stringify(error.response.data, null, 2)}`,
        );
        this.logger.error(
          `Response headers: ${JSON.stringify(error.response.headers, null, 2)}`,
        );
      }

      if (error.config) {
        this.logger.error(`Request URL: ${error.config.url}`);
        this.logger.error(`Request method: ${error.config.method}`);
      }

      throw error;
    }
  }

  /**
   * Add document to project metadata
   */
  private async addDocumentToProject(
    projectId: string,
    documentData: any,
  ): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const metadata = (project.metadata as ProjectMetadata) || {};

    if (!metadata.documents) {
      metadata.documents = [];
    }

    metadata.documents.push(documentData);

    await this.prisma.project.update({
      where: { id: projectId },
      data: { metadata: metadata as any },
    });
  }

  /**
   * Add image to project metadata
   */
  private async addImageToProject(
    projectId: string,
    imageData: any,
  ): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const metadata = (project.metadata as ProjectMetadata) || {};

    if (!metadata.images) {
      metadata.images = [];
    }

    metadata.images.push(imageData);

    await this.prisma.project.update({
      where: { id: projectId },
      data: { metadata: metadata as any },
    });
  }

  /**
   * Extract file extension from filename
   */
  private extractFileExtension(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1] : '';
  }
}
