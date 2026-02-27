import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BucketName } from '../openai';
import * as crypto from 'crypto';
import { sanitizeFileName, validateStoragePath } from './file-validator';

/**
 * Maximum allowed file size in bytes (10MB by default)
 * Should be configured via environment variable
 */
const MAX_FILE_SIZE = parseInt(process.env.DO_MAX_FILE_SIZE || '10485760', 10); // 10MB

// Initialize S3 client for DigitalOcean Spaces
const getSpacesClient = () => {
  const accessKeyId = process.env.DO_SPACES_KEY;
  const secretAccessKey = process.env.DO_SPACES_SECRET;
  const endpoint = process.env.DO_SPACES_ENDPOINT;
  const region = process.env.DO_SPACES_REGION;

  if (!accessKeyId || !secretAccessKey || !endpoint || !region) {
    throw new Error(
      'Missing DigitalOcean Spaces configuration in environment variables',
    );
  }

  return new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: false, // Use virtual-hosted style URLs
  });
};

/**
 * Securely retrieve file from DigitalOcean Spaces
 * @param id File key/path
 * @param bucketName Optional bucket override
 * @returns File data and content type
 */
export const getFileFromSpaces = async (id: string, bucketName: BucketName) => {
  // Validate and sanitize the file ID
  if (!id || typeof id !== 'string' || id.trim() === '') {
    throw new Error('Invalid file ID provided');
  }

  // Prevent path traversal attacks
  validateStoragePath(id);

  const client = getSpacesClient();
  const Bucket = bucketName || process.env.DO_SPACES_BUCKET;

  if (!Bucket) {
    throw new Error(
      'No bucket name provided and DO_SPACES_BUCKET environment variable not set',
    );
  }

  const command = new GetObjectCommand({
    Bucket,
    Key: id,
  });
  try {
    const response = await client.send(command);
    if (!response.Body) {
      throw new Error('No file content received');
    }
    const str = await response.Body.transformToByteArray();
    const contentType = response.ContentType;
    return { data: str, contentType };
  } catch (err: any) {
    console.error('Error retrieving file:', err);
    if (err.name === 'NoSuchKey') {
      throw new Error(`The specified key does not exist: ${id}`);
    } else if (err.name === 'InvalidObjectState') {
      throw new Error(`Object is archived and inaccessible: ${id}`);
    }
    throw new Error(
      `Failed to retrieve file from DigitalOcean Spaces: ${err.message}`,
    );
  }
};

/**
 * Get URLs for accessing a file in DigitalOcean Spaces
 * @param key File key/path
 * @returns Public and signed URLs
 */
export const getSpacesUrl = async (key: string) => {
  // Validate and sanitize the key
  if (!key || typeof key !== 'string' || key.trim() === '') {
    throw new Error('Invalid file key provided');
  }

  // Prevent path traversal attacks
  validateStoragePath(key);

  const client = getSpacesClient();
  const Bucket = process.env.DO_SPACES_BUCKET;

  try {
    // For public files, construct the direct URL
    const publicUrl = `${process.env.DO_SPACES_ENDPOINT}/${Bucket}/${key}`;

    // For private files, get a signed URL with short expiration
    const command = new GetObjectCommand({ Bucket, Key: key });
    const signedUrl = await getSignedUrl(client, command, {
      expiresIn: 900, // 15 minutes expiration for security
    });

    return {
      publicUrl,
      signedUrl,
    };
  } catch (error) {
    console.error('Error getting URLs from DigitalOcean Spaces:', error);
    throw new Error('Failed to get URLs from DigitalOcean Spaces');
  }
};

/**
 * Securely delete a file from DigitalOcean Spaces
 * @param key File key/path to delete
 */
export const deleteFromSpaces = async (key: string) => {
  // Validate and sanitize the key
  if (!key || typeof key !== 'string' || key.trim() === '') {
    throw new Error('Invalid file key provided');
  }

  // Prevent path traversal attacks
  validateStoragePath(key);

  const client = getSpacesClient();
  const Bucket = process.env.DO_SPACES_BUCKET;

  try {
    const bucketParams = { Bucket, Key: key };
    await client.send(new DeleteObjectCommand(bucketParams));
  } catch (error) {
    console.error('Error deleting file from DigitalOcean Spaces:', error);
    throw new Error('Failed to delete file from DigitalOcean Spaces');
  }
};

/**
 * Upload a file to DigitalOcean Spaces
 * @param fileBuffer The file buffer to upload
 * @param fileName The desired filename (will be sanitized)
 * @param contentType The MIME type of the file
 * @param folder Optional folder path within the bucket
 * @returns Public URL of the uploaded file
 */
export const uploadToSpaces = async (
  fileBuffer: Buffer,
  fileName: string,
  contentType: string,
  folder: string = 'images',
): Promise<string> => {
  // Validate input
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error('Invalid file buffer provided');
  }

  if (!fileName || typeof fileName !== 'string') {
    throw new Error('Invalid file name provided');
  }

  if (!contentType || typeof contentType !== 'string') {
    throw new Error('Invalid content type provided');
  }

  // Check file size
  if (fileBuffer.length > MAX_FILE_SIZE) {
    throw new Error(
      `File size exceeds maximum allowed size of ${MAX_FILE_SIZE} bytes`,
    );
  } // Generate unique filename
  const uniqueId = crypto.randomUUID();
  const extension = fileName.includes('.') ? fileName.split('.').pop() : 'png';
  const sanitizedName = `${uniqueId}.${extension}`;
  // Construct the key with folder structure
  const key = folder ? `${folder}/${sanitizedName}` : sanitizedName;

  // Debug logging
  console.log('Upload key being validated:', key);
  console.log('Folder parameter:', folder);
  console.log('Sanitized name:', sanitizedName);

  // Validate the path
  validateStoragePath(key);

  const client = getSpacesClient();
  const Bucket = process.env.DO_SPACES_BUCKET;

  if (!Bucket) {
    throw new Error('DO_SPACES_BUCKET environment variable not set');
  }

  try {
    const command = new PutObjectCommand({
      Bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
      ACL: 'public-read', // Make the file publicly accessible
    });

    await client.send(command);

    // Return the public URL
    const publicUrl = `${process.env.DO_SPACES_ENDPOINT}/${Bucket}/${key}`;
    return publicUrl;
  } catch (error) {
    console.error('Error uploading file to DigitalOcean Spaces:', error);
    throw new Error('Failed to upload file to DigitalOcean Spaces');
  }
};
