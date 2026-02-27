import { BadRequestException } from '@nestjs/common';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * List of allowed MIME types for uploads
 * Add or remove types based on your application's requirements
 */
const ALLOWED_MIME_TYPES = [
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',

  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx

  // Text
  'text/plain',
  'text/csv',
  'application/json',
  'application/xml',
];

/**
 * Sanitizes a filename to prevent path traversal and other security issues
 * @param originalName Original filename
 * @returns Sanitized filename with UUID prefix
 */
export function sanitizeFileName(originalName: string): string {
  // Strip any path information and get only the filename
  const filename = path.basename(originalName).trim();

  // Generate a random UUID prefix to prevent filename collisions and make filenames unpredictable
  const uniquePrefix = crypto.randomUUID();

  // Get file extension (lowercase)
  const extension = path.extname(filename).toLowerCase();

  // Remove extension from filename
  const nameWithoutExt = path.basename(filename, extension);

  // Replace any non-alphanumeric characters except dashes and underscores
  const sanitizedName = nameWithoutExt
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/-{2,}/g, '-'); // Replace multiple consecutive dashes with a single dash

  // Ensure the name isn't too long
  const truncatedName = sanitizedName.substring(0, 50);

  // Combine unique prefix with sanitized name and extension
  return `${uniquePrefix}-${truncatedName}${extension}`;
}

/**
 * Gets a mime type policy string (comma separated list) for use in Content-Security-Policy
 * @returns String like "image/png,image/jpeg,..."
 */
export function getAllowedMimeTypesString(): string {
  return ALLOWED_MIME_TYPES.join(',');
}

/**
 * Validates and secures the file storage path
 * @param filePath The file path to validate
 * @param allowedPaths List of allowed paths
 */
export function validateStoragePath(
  filePath: string,
  allowedPaths: string[] = ['uploads', 'documents', 'images'],
): void {
  // Debug logging
  console.log('validateStoragePath - Input path:', filePath);
  console.log('validateStoragePath - Allowed paths:', allowedPaths);

  // Normalize the path to prevent path traversal attacks and use forward slashes consistently
  const normalizedPath = path
    .normalize(filePath)
    .replace(/^\/+/, '')
    .replace(/\\/g, '/');
  console.log('validateStoragePath - Normalized path:', normalizedPath);

  // Get the top-level directory
  const topDir = normalizedPath.split('/')[0];
  console.log('validateStoragePath - Top directory:', topDir);

  // Ensure the path starts with an allowed directory
  if (!allowedPaths.includes(topDir)) {
    console.error('validateStoragePath - VALIDATION FAILED!');
    console.error(
      'validateStoragePath - Top dir not in allowed paths:',
      topDir,
      'not in',
      allowedPaths,
    );
    throw new BadRequestException(
      `Invalid storage path. Must be in one of: ${allowedPaths.join(', ')}`,
    );
  }

  console.log('validateStoragePath - Validation passed!');

  // Check for path traversal attempts
  if (normalizedPath.includes('..')) {
    throw new BadRequestException('Path traversal attack detected');
  }
}
