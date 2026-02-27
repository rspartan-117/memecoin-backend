import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  GetObjectCommand,
  GetObjectCommandInput,
  PutObjectCommand,
  PutObjectCommandInput,
  ListObjectsV2Command,
  DeleteObjectCommand,
  ObjectCannedACL,
  CopyObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import axios from 'axios';

@Injectable()
export class S3UrlService {
  private readonly logger = new Logger(S3UrlService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.configService.get<string>('DO_SPACES_ENDPOINT');
    const region = this.configService.get<string>('DO_SPACES_REGION');
    const accessKeyId = this.configService.get<string>('DO_SPACES_KEY');
    const secretAccessKey = this.configService.get<string>('DO_SPACES_SECRET');
    const bucket = this.configService.get<string>('DO_SPACES_BUCKET');

    const missingVars: string[] = [];
    if (!endpoint) missingVars.push('DO_SPACES_ENDPOINT');
    if (!region) missingVars.push('DO_SPACES_REGION');
    if (!accessKeyId) missingVars.push('DO_SPACES_KEY');
    if (!secretAccessKey) missingVars.push('DO_SPACES_SECRET');
    if (!bucket) missingVars.push('DO_SPACES_BUCKET');

    if (missingVars.length > 0) {
      throw new Error(
        `Missing required DigitalOcean Spaces environment variables: ${missingVars.join(', ')}. ` +
          'File storage and screenshot capture will not function without these.',
      );
    }

    this.s3Client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
      },
    });
    this.bucketName = bucket!;
  }

  private validateFileKey(fileKey: string): void {
    if (!fileKey || fileKey.length > 1024) {
      throw new Error('Invalid fileKey: empty or exceeds 1024 characters');
    }
    // S3 allows most characters except null bytes and certain control characters
    if (
      fileKey.includes('\0') ||
      fileKey.includes('\n') ||
      fileKey.includes('\r')
    ) {
      throw new Error('Invalid fileKey: contains forbidden control characters');
    }
  }

  private capExpiresIn(expiresIn: number): number {
    return Math.min(expiresIn || 3600, 10800); // Max 3hr
  }

  /**
   * Generate a presigned URL for a protected S3 object
   * @param fileKey - The S3 object key/path
   * @param expiresIn - URL expiration time in seconds (default: 1 hour)
   */
  async generatePresignedUrl(
    fileKey: string,
    expiresIn = 3600,
  ): Promise<string> {
    this.validateFileKey(fileKey);
    const cappedExpiresIn = this.capExpiresIn(expiresIn);
    const params: GetObjectCommandInput = {
      Bucket: this.bucketName,
      Key: fileKey,
    };
    const command = new GetObjectCommand(params);
    return getSignedUrl(this.s3Client, command, { expiresIn: cappedExpiresIn });
  }

  async getSecurePresignedUrl(
    fileName: string,
    userId: string,
    expiresIn = 3600,
  ): Promise<{ url: string; key: string }> {
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `uploads/${userId}/${Date.now()}-${sanitizedFileName}`;
    this.validateFileKey(key);
    const cappedExpiresIn = this.capExpiresIn(expiresIn);

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      // Removed ACL, ServerSideEncryption, Metadata, and CacheControl
      // as these create required headers that the frontend must include
      // Simple presigned URL for easier frontend integration
    });

    const signedUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: cappedExpiresIn, // 1 hour for upload
    });

    return { url: signedUrl, key };
  }

  /**
   * Generate a presigned URL with advanced options that require specific headers
   * Use this only when the frontend can properly set the required headers
   */
  async getAdvancedPresignedUrl(
    fileName: string,
    userId: string,
    isPublic: boolean = false,
    expiresIn = 3600,
  ): Promise<{
    url: string;
    key: string;
    requiredHeaders: Record<string, string>;
  }> {
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `uploads/${userId}/${Date.now()}-${sanitizedFileName}`;
    this.validateFileKey(key);
    const cappedExpiresIn = this.capExpiresIn(expiresIn);

    const acl: ObjectCannedACL = isPublic ? 'public-read' : 'private';
    // If isOCR is true, make the object public, otherwise private

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ACL: acl,
      ServerSideEncryption: 'AES256',
      Metadata: {
        uploadedBy: userId,
        uploadedAt: new Date().toISOString(),
        originalName: fileName,
      },
      CacheControl: 'no-cache, no-store, must-revalidate',
    });

    const signedUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: cappedExpiresIn, // 1 hour for upload
    });

    // Return the required headers that must be included in the upload request
    const requiredHeaders = {
      'x-amz-acl': acl,
      'x-amz-server-side-encryption': 'AES256',
      'x-amz-meta-uploadedby': userId,
      'x-amz-meta-uploadedat': new Date().toISOString(),
      'x-amz-meta-originalname': fileName,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    };

    return { url: signedUrl, key, requiredHeaders };
  }

  /**
   * Update metadata for an uploaded file
   * Call this after a successful upload to add metadata without affecting the presigned URL
   */
  async updateFileMetadata(
    fileKey: string,
    userId: string,
    originalFileName: string,
  ): Promise<void> {
    this.validateFileKey(fileKey);
    try {
      // Attempt CopyObject first (may fail on Spaces)
      const head = await this.s3Client.send(
        new HeadObjectCommand({ Bucket: this.bucketName, Key: fileKey }),
      );
      const copyParams = {
        Bucket: this.bucketName,
        CopySource: `${this.bucketName}/${fileKey}`,
        Key: fileKey,
        MetadataDirective: 'REPLACE' as const,
        Metadata: {
          ...head.Metadata,
          uploadedBy: userId,
          originalName: originalFileName,
          updatedAt: new Date().toISOString(),
        },
      };
      await this.s3Client.send(new CopyObjectCommand(copyParams));
      this.logger.log(`Metadata updated via CopyObject: ${fileKey}`);
    } catch (copyError) {
      this.logger.warn(
        'CopyObject failed (Spaces limit?), using download/upload',
        { error: copyError.message },
      );
      // Fallback: download + upload
      const { buffer, contentType } =
        await this.downloadFileWithMetadata(fileKey);
      const params: PutObjectCommandInput = {
        Bucket: this.bucketName,
        Key: fileKey,
        Body: buffer,
        Metadata: {
          uploadedBy: userId,
          originalName: originalFileName,
          updatedAt: new Date().toISOString(),
        },
        ContentType: contentType,
      };
      await this.s3Client.send(new PutObjectCommand(params));
    }
  }

  /**
   * Download a file from S3
   * @param fileKey - The S3 object key/path
   * @returns Promise<Buffer> - The file content as a buffer
   */
  async downloadFile(fileKey: string): Promise<Buffer> {
    this.validateFileKey(fileKey);
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
      });

      const response = await this.s3Client.send(command);

      if (!response.Body) {
        throw new Error('No file content received from S3');
      }

      // Convert the readable stream to buffer
      const chunks: Uint8Array[] = [];
      const stream = response.Body as any;

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    } catch (error) {
      this.logger.error('Error downloading file from S3:', error);
      throw new Error(`Failed to download file from S3: ${error.message}`);
    }
  }

  /**
   * Download a file from S3 and get file metadata
   * @param fileKey - The S3 object key/path
   * @returns Promise<{buffer: Buffer, metadata: any, contentType: string}> - File content, metadata, and content type
   */
  async downloadFileWithMetadata(fileKey: string): Promise<{
    buffer: Buffer;
    metadata: Record<string, string>;
    contentType: string;
    contentLength: number;
    lastModified: Date;
  }> {
    this.validateFileKey(fileKey);
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
      });

      const response = await this.s3Client.send(command);

      if (!response.Body) {
        throw new Error('No file content received from S3');
      }

      // Convert the readable stream to buffer
      const chunks: Uint8Array[] = [];
      const stream = response.Body as any;

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      const buffer = Buffer.concat(chunks);

      return {
        buffer,
        metadata: response.Metadata || {},
        contentType: response.ContentType || 'application/octet-stream',
        contentLength: response.ContentLength || buffer.length,
        lastModified: response.LastModified || new Date(),
      };
    } catch (error) {
      this.logger.error('Error downloading file with metadata from S3:', error);
      throw new Error(
        `Failed to download file with metadata from S3: ${error.message}`,
      );
    }
  }

  /**
   * Check if a file exists in S3
   * @param fileKey - The S3 object key/path
   * @returns Promise<boolean> - True if file exists, false otherwise
   */
  async fileExists(fileKey: string): Promise<boolean> {
    this.validateFileKey(fileKey);
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error) {
      if (
        error.name === 'NoSuchKey' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        return false;
      }
      // Re-throw other errors (permissions, network, etc.)
      throw error;
    }
  }

  /**
   * Get file metadata without downloading the content
   * @param fileKey - The S3 object key/path
   * @returns Promise<object> - File metadata
   */
  async getFileMetadata(fileKey: string): Promise<{
    metadata: Record<string, string>;
    contentType: string;
    contentLength: number;
    lastModified: Date;
    etag: string;
  }> {
    this.validateFileKey(fileKey);
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
      });

      const response = await this.s3Client.send(command);

      return {
        metadata: response.Metadata || {},
        contentType: response.ContentType || 'application/octet-stream',
        contentLength: response.ContentLength || 0,
        lastModified: response.LastModified || new Date(),
        etag: response.ETag || '',
      };
    } catch (error) {
      this.logger.error('Error getting file metadata from S3:', error);
      throw new Error(`Failed to get file metadata from S3: ${error.message}`);
    }
  }

  /**
   * Download file as a stream (useful for large files)
   * @param fileKey - The S3 object key/path
   * @returns Promise<ReadableStream> - File content as a readable stream
   */
  async downloadFileAsStream(fileKey: string): Promise<any> {
    this.validateFileKey(fileKey);
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
      });

      const response = await this.s3Client.send(command);

      if (!response.Body) {
        throw new Error('No file content received from S3');
      }

      return response.Body;
    } catch (error) {
      this.logger.error('Error downloading file stream from S3:', error);
      throw new Error(
        `Failed to download file stream from S3: ${error.message}`,
      );
    }
  }

  /**
   * Generate a presigned URL specifically for document parsing services
   * Uses a longer expiration time to ensure parsing completes
   */
  async generateParsingUrl(fileKey: string): Promise<string> {
    // 2 hours expiration for parsing
    const expiresIn = 1 * 60 * 60;
    return this.generatePresignedUrl(fileKey, expiresIn);
  }

  /**
   * Generate presigned URLs for multiple files
   * @param fileKeys - Array of S3 object keys
   * @param expiresIn - URL expiration time in seconds
   */
  async generateBulkPresignedUrls(
    fileKeys: string[],
    expiresIn = 3600,
  ): Promise<Record<string, string>> {
    const cappedExpiresIn = this.capExpiresIn(expiresIn);
    const results = await Promise.all(
      fileKeys.map(async (key) => {
        const url = await this.generatePresignedUrl(key, cappedExpiresIn);
        return { key, url };
      }),
    );
    return results.reduce(
      (acc, { key, url }) => {
        acc[key] = url;
        return acc;
      },
      {} as Record<string, string>,
    );
  }

  /**
   * Upload a file to S3 from base64 encoded data
   * @param fileKey - The S3 object key/path where to store the file
   * @param base64Data - Base64 encoded file content
   * @param contentType - MIME type of the file
   * @param fileName - Original filename for metadata
   * @returns Promise<string> - The S3 key of the uploaded file
   */
  async uploadFromBase64(
    fileKey: string,
    base64Data: string,
    contentType: string,
    fileName: string,
  ): Promise<string> {
    this.validateFileKey(fileKey);
    try {
      // Decode base64 data to buffer
      const buffer = Buffer.from(base64Data, 'base64');

      const params: PutObjectCommandInput = {
        Bucket: this.bucketName,
        Key: fileKey,
        Body: buffer,
        ContentType: contentType,
        ACL: 'public-read', // Make publicly accessible
      };

      const command = new PutObjectCommand(params);
      await this.s3Client.send(command);

      return fileKey;
    } catch (error) {
      this.logger.error('Error uploading base64 file to S3:', error);
      throw new Error(`Failed to upload file to S3: ${error.message}`);
    }
  }

  /**
   * Download a file from URL and upload to S3
   * @param fileKey - The S3 object key/path where to store the file
   * @param downloadUrl - URL to download the file from
   * @param contentType - MIME type of the file
   * @param fileName - Original filename for metadata
   * @returns Promise<string> - The S3 key of the uploaded file
   */
  async uploadFromUrl(
    fileKey: string,
    downloadUrl: string,
    contentType: string,
    fileName: string,
    isPublic: boolean = true, // Default to public for generated images
  ): Promise<string> {
    this.validateFileKey(fileKey);
    try {
      const response = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30s
        maxRedirects: 5,
      });
      if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(response.data);
      if (buffer.length > 5 * 1024 * 1024 * 1024)
        throw new Error('File too large'); // 5GB Spaces limit

      const params: PutObjectCommandInput = {
        Bucket: this.bucketName,
        Key: fileKey,
        Body: buffer,
        ContentType: contentType,
        ACL: isPublic ? 'public-read' : undefined, // Make public if requested
        // Metadata removed to prevent HTTP 431 errors with long URLs
      };

      const command = new PutObjectCommand(params);
      await this.s3Client.send(command);

      return fileKey;
    } catch (error) {
      this.logger.error('Upload from URL failed', {
        error,
        downloadUrl: downloadUrl.substring(0, 50) + '...',
      });
      throw new Error(`Failed to upload from URL: ${error.message}`);
    }
  }

  /**
   * Upload a Buffer directly to S3 (useful for generated files like audio)
   * @param buffer - File content as Buffer
   * @param fileKey - The S3 object key/path where to store the file
   * @param contentType - MIME type of the file
   * @param metadata - Optional metadata to attach to the file
   * @param isPublic - Whether to make the file publicly accessible (default: true for podcasts)
   * @returns Promise<string> - The S3 key of the uploaded file
   */
  async uploadBuffer(
    buffer: Buffer,
    fileKey: string,
    contentType: string,
    metadata?: Record<string, string>,
    isPublic: boolean = false,
  ): Promise<string> {
    this.validateFileKey(fileKey);
    try {
      const params: PutObjectCommandInput = {
        Bucket: this.bucketName,
        Key: fileKey,
        Body: buffer,
        ContentType: contentType,
        ACL: isPublic ? 'public-read' : undefined, // Omit for private
        Metadata: metadata || {},
      };

      if (isPublic) {
        this.logger.warn('Public ACL used', { fileKey, caller: 'trace' });
      }

      const command = new PutObjectCommand(params);
      await this.s3Client.send(command);

      this.logger.log(
        `✓ Uploaded buffer to S3: ${fileKey} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`,
      );
      return fileKey;
    } catch (error) {
      this.logger.error('Error uploading buffer to S3:', error);
      throw new Error(`Failed to upload buffer to S3: ${error.message}`);
    }
  }

  /**
   * Generate a unique file key for converted files
   * @param userId - User ID
   * @param originalFileName - Original filename
   * @param targetFormat - Target format extension
   * @param conversionId - Conversion ID for tracking
   * @returns string - Unique S3 key
   */
  generateConvertedFileKey(
    userId: string,
    originalFileName: string,
    targetFormat: string,
    conversionId: string,
  ): string {
    const timestamp = Date.now();
    const baseName = originalFileName.replace(/\.[^/.]+$/, ''); // Remove extension
    return `converted/${userId}/${conversionId}/${baseName}_${timestamp}.${targetFormat}`;
  }

  /**
   * Generate a secure download URL for a file key
   * Works with files uploaded with advanced security (private ACL, encryption, etc.)
   * @param fileKey - The S3 object key/path
   * @param expiresIn - URL expiration time in seconds (default: 1 hour)
   * @returns Promise<string> - Presigned download URL
   */
  async getSecureDownloadUrl(
    fileKey: string,
    expiresIn = 3600,
  ): Promise<string> {
    this.validateFileKey(fileKey);
    const cappedExpiresIn = this.capExpiresIn(expiresIn);
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
        // These parameters ensure the download URL works with encrypted/private files
        ResponseContentDisposition: 'attachment', // Force download
      });

      const signedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: cappedExpiresIn,
      });

      return signedUrl;
    } catch (error) {
      this.logger.error('Error generating secure download URL:', error);
      throw new Error(
        `Failed to generate secure download URL: ${error.message}`,
      );
    }
  }

  /**
   * Generate a secure download URL with custom response headers
   * @param fileKey - The S3 object key/path
   * @param options - Download options
   * @returns Promise<string> - Presigned download URL with custom headers
   */
  async getSecureDownloadUrlWithOptions(
    fileKey: string,
    options: {
      expiresIn?: number;
      fileName?: string;
      contentType?: string;
      forceDownload?: boolean;
    } = {},
  ): Promise<string> {
    this.validateFileKey(fileKey);
    const {
      expiresIn = 3600,
      fileName,
      contentType,
      forceDownload = true,
    } = options;
    const cappedExpiresIn = this.capExpiresIn(expiresIn);
    try {
      const commandParams: any = {
        Bucket: this.bucketName,
        Key: fileKey,
      };

      // Set content disposition for download behavior
      if (forceDownload) {
        const downloadFileName =
          fileName || fileKey.split('/').pop() || 'download';
        commandParams.ResponseContentDisposition = `attachment; filename="${downloadFileName}"`;
      } else if (fileName) {
        commandParams.ResponseContentDisposition = `inline; filename="${fileName}"`;
      }

      // Override content type if specified
      if (contentType) {
        commandParams.ResponseContentType = contentType;
      }

      const command = new GetObjectCommand(commandParams);

      const signedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: cappedExpiresIn,
      });

      return signedUrl;
    } catch (error) {
      this.logger.error(
        'Error generating secure download URL with options:',
        error,
      );
      throw new Error(
        `Failed to generate secure download URL with options: ${error.message}`,
      );
    }
  }

  /**
   * Generate multiple secure download URLs for batch operations
   * @param fileKeys - Array of S3 object keys
   * @param expiresIn - URL expiration time in seconds
   * @returns Promise<Record<string, string>> - Map of fileKey to download URL
   */
  async getBatchSecureDownloadUrls(
    fileKeys: string[],
    expiresIn = 3600,
  ): Promise<Record<string, string>> {
    const cappedExpiresIn = this.capExpiresIn(expiresIn);
    try {
      const results = await Promise.all(
        fileKeys.map(async (fileKey) => {
          const url = await this.getSecureDownloadUrl(fileKey, cappedExpiresIn);
          return { fileKey, url };
        }),
      );

      return results.reduce(
        (acc, { fileKey, url }) => {
          acc[fileKey] = url;
          return acc;
        },
        {} as Record<string, string>,
      );
    } catch (error) {
      this.logger.error('Error generating batch secure download URLs:', error);
      throw new Error(
        `Failed to generate batch secure download URLs: ${error.message}`,
      );
    }
  }

  /**
   * Generate a secure download URL that works specifically with files uploaded using getAdvancedPresignedUrl
   * Handles encrypted files and private ACL properly
   * @param fileKey - The S3 object key/path
   * @param expiresIn - URL expiration time in seconds (default: 1 hour)
   * @returns Promise<string> - Presigned download URL that works with encrypted files
   */
  async getAdvancedSecureDownloadUrl(
    fileKey: string,
    expiresIn = 3600,
  ): Promise<string> {
    this.validateFileKey(fileKey);
    const cappedExpiresIn = this.capExpiresIn(expiresIn);
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
        // Ensure compatibility with AES256 encrypted files
        // S3 handles the encryption automatically for download
        ResponseContentDisposition: 'attachment',
        // ResponseCacheControl: 'no-cache, no-store, must-revalidate', // Respect original cache settings
      });

      const signedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: cappedExpiresIn,
      });

      return signedUrl;
    } catch (error) {
      this.logger.error(
        'Error generating advanced secure download URL:',
        error,
      );
      throw new Error(
        `Failed to generate advanced secure download URL: ${error.message}`,
      );
    }
  }

  /**
   * Generate a clean URL for viewing files directly in the browser
   * This URL can be opened in a browser to view/display the file (images, PDFs, etc.)
   * @param fileKey - The S3 object key/path
   * @param expiresIn - URL expiration time in seconds (default: 1 week, capped at 3 hours for DigitalOcean Spaces)
   * @returns Promise<string> - Clean presigned URL for browser viewing
   */
  async getViewableUrl(
    fileKey: string,
    isProfile: boolean = false,
    expiresIn = 604800,
  ): Promise<string> {
    this.validateFileKey(fileKey);
    const cappedExpiresIn = this.capExpiresIn(expiresIn);
    try {
      // If isProfile is true, return the public URL directly (no signing needed)
      if (isProfile) {
        return this.getPublicUrl(fileKey);
      }

      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
        // No ResponseContentDisposition or other response headers
        // This allows the browser to display the file inline based on its content type
      });

      const signedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: cappedExpiresIn,
      });

      return signedUrl;
    } catch (error) {
      this.logger.error('Error generating viewable URL:', error);
      throw new Error(`Failed to generate viewable URL: ${error.message}`);
    }
  }

  /**
   * Generate a public URL for external APIs (like Mistral OCR, LlamaIndex, etc.)
   * This method avoids adding response headers that can cause issues with external services
   * @param fileKey - The S3 object key/path
   * @param expiresIn - URL expiration time in seconds (default: 1 hour)
   * @returns Promise<string> - Clean presigned URL without problematic response headers
   */
  async getExternalApiUrl(fileKey: string, expiresIn = 3600): Promise<string> {
    this.validateFileKey(fileKey);
    const cappedExpiresIn = this.capExpiresIn(expiresIn);
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
        // No ResponseContentDisposition or other response headers
        // This creates a clean URL that external APIs can fetch without issues
      });

      const signedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: cappedExpiresIn,
      });

      return signedUrl;
    } catch (error) {
      this.logger.error('Error generating external API URL:', error);
      throw new Error(`Failed to generate external API URL: ${error.message}`);
    }
  }

  /**
   * Generate a public URL for viewing files if your bucket allows public access
   * This creates a direct URL without presigning (only works if bucket/object is public)
   * @param fileKey - The S3 object key/path
   * @returns string - Direct public URL (no expiration)
   */
  getPublicUrl(fileKey: string): string {
    // Extract the endpoint base URL (remove the protocol and add the bucket as subdomain)
    const endpoint = this.configService.get<string>('DO_SPACES_ENDPOINT');
    const region = this.configService.get<string>('DO_SPACES_REGION');

    // For DigitalOcean Spaces, the format is: https://bucket-name.region.digitaloceanspaces.com/file-key
    if (endpoint && endpoint.includes('digitaloceanspaces.com')) {
      return `https://${this.bucketName}.${region}.digitaloceanspaces.com/${fileKey}`;
    }

    // Generic S3-compatible URL format
    return `${endpoint}/${this.bucketName}/${fileKey}`;
  }

  /**
   * List files in a directory (useful for debugging)
   * @param prefix - Directory prefix to search in (e.g., 'uploads/user123/')
   * @returns Promise<string[]> - Array of file keys
   */
  async listFiles(prefix: string = ''): Promise<string[]> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: 100, // Limit results
      });

      const response = await this.s3Client.send(command);

      return response.Contents?.map((obj) => obj.Key || '') || [];
    } catch (error) {
      this.logger.error('Error listing files:', error);
      throw new Error(`Failed to list files: ${error.message}`);
    }
  }

  /**
   * Debug method to check file existence and get metadata
   * @param fileKey - The file key to debug
   * @returns Promise<object> - Debug information about the file
   */
  async debugFile(fileKey: string): Promise<{
    exists: boolean;
    metadata?: any;
    similarFiles?: string[];
  }> {
    this.validateFileKey(fileKey);
    try {
      const exists = await this.fileExists(fileKey);

      if (exists) {
        const metadata = await this.getFileMetadata(fileKey);
        return { exists: true, metadata };
      } else {
        // Look for similar files in the same directory
        const directory = fileKey.substring(0, fileKey.lastIndexOf('/') + 1);
        const similarFiles = await this.listFiles(directory);

        return {
          exists: false,
          similarFiles: similarFiles.filter((f) => f !== fileKey),
        };
      }
    } catch (error) {
      this.logger.error('Error debugging file:', error);
      return { exists: false };
    }
  }

  /**
   * Extract S3 key from a full DigitalOcean Spaces URL
   * @param url - Full S3/Spaces URL
   * @returns S3 key (path without domain)
   */
  extractKeyFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // Remove leading slash and return the path
      return urlObj.pathname.startsWith('/')
        ? urlObj.pathname.substring(1)
        : urlObj.pathname;
    } catch (error) {
      this.logger.error('Error extracting key from URL:', { url, error });
      throw new Error(`Invalid S3 URL: ${error.message}`);
    }
  }

  /**
   * Delete a file from S3/Spaces
   * @param fileKey - S3 key of the file to delete
   */
  async deleteFile(fileKey: string): Promise<void> {
    this.validateFileKey(fileKey);
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
      });
      await this.s3Client.send(command);
      this.logger.log(`Successfully deleted file: ${fileKey}`);
    } catch (error) {
      this.logger.error('Error deleting file from S3:', { fileKey, error });
      throw new Error(`Failed to delete file from S3: ${error.message}`);
    }
  }
}
