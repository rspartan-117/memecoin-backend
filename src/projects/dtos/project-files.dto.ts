import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProjectFileDto {
  @ApiProperty({
    description: 'File ID',
    example: 'file_abc123',
  })
  id: string;

  @ApiProperty({
    description: 'Full file path relative to project root',
    example: 'src/main.py',
  })
  file_path: string;

  @ApiProperty({
    description: 'File content',
    example: 'print("Hello World")',
  })
  content: string;

  @ApiProperty({
    description: 'File size in bytes',
    example: 1024,
  })
  size_bytes: number;

  @ApiPropertyOptional({
    description: 'MIME type',
    example: 'text/x-python',
  })
  mime_type?: string;

  @ApiProperty({
    description: 'Tool that created this file',
    example: 'write_file',
  })
  created_by_tool: string;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2025-01-27T10:00:00Z',
  })
  created_at: string;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2025-01-27T10:30:00Z',
  })
  updated_at: string;
}

export class ProjectFilesResponse {
  @ApiProperty({
    description: 'Project ID',
    example: 'proj_abc123',
  })
  project_id: string;

  @ApiProperty({
    description: 'Total number of files',
    example: 15,
  })
  file_count: number;

  @ApiProperty({
    description: 'File list',
    type: [ProjectFileDto],
  })
  files: ProjectFileDto[];

  @ApiProperty({
    description: 'Last updated timestamp',
    example: '2025-01-27T10:30:00Z',
  })
  updated_at: string;
}

export class FileTreeNode {
  @ApiProperty({
    description: 'File or folder name',
    example: 'main.py',
  })
  name: string;

  @ApiProperty({
    description: 'Node type',
    enum: ['file', 'folder'],
    example: 'file',
  })
  type: 'file' | 'folder';

  @ApiProperty({
    description: 'Full path',
    example: 'src/main.py',
  })
  path: string;

  @ApiPropertyOptional({
    description: 'Child nodes (for folders)',
    type: [FileTreeNode],
  })
  children?: FileTreeNode[];

  @ApiPropertyOptional({
    description: 'File size in bytes (for files)',
    example: 1024,
  })
  size_bytes?: number;

  @ApiPropertyOptional({
    description: 'File ID (for files)',
    example: 'file_abc123',
  })
  file_id?: string;

  @ApiPropertyOptional({
    description: 'Last update timestamp (for files)',
    example: '2025-01-27T10:30:00Z',
  })
  updated_at?: string;
}

export class ProjectFilesTreeResponse {
  @ApiProperty({
    description: 'Project ID',
    example: 'proj_abc123',
  })
  project_id: string;

  @ApiProperty({
    description: 'Total number of files',
    example: 15,
  })
  file_count: number;

  @ApiProperty({
    description: 'Hierarchical tree structure',
    type: [FileTreeNode],
  })
  tree: FileTreeNode[];

  @ApiProperty({
    description: 'Flat file list with full content',
    type: [ProjectFileDto],
  })
  files: ProjectFileDto[];

  @ApiProperty({
    description: 'Last updated timestamp',
    example: '2025-01-27T10:30:00Z',
  })
  updated_at: string;
}
