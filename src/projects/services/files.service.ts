import {
  Injectable,
  Logger,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import {
  ProjectFileDto,
  ProjectFilesResponse,
  ProjectFilesTreeResponse,
  FileTreeNode,
} from '../dtos/project-files.dto';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all files for a project (flat structure)
   */
  async getProjectFiles(
    projectId: string,
    userId: string,
  ): Promise<ProjectFilesResponse> {
    this.logger.log(`Getting files for project ${projectId}`);

    // Verify project ownership
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        userId,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Query all non-deleted files for this project
    const files = await this.prisma.projectFile.findMany({
      where: {
        project_id: projectId,
        is_deleted: false,
      },
      orderBy: {
        file_path: 'asc',
      },
    });

    const filesDtos = files.map((file) => this.formatFileDto(file));

    return {
      project_id: projectId,
      file_count: files.length,
      files: filesDtos,
      updated_at: this.getLatestTimestamp(files),
    };
  }

  /**
   * Get files with tree structure (recommended for file explorer)
   */
  async getProjectFilesWithTree(
    projectId: string,
    userId: string,
  ): Promise<ProjectFilesTreeResponse> {
    this.logger.log(`Getting file tree for project ${projectId}`);

    const filesData = await this.getProjectFiles(projectId, userId);

    // Build tree structure from flat files
    const tree = this.buildFileTree(filesData.files);

    return {
      project_id: filesData.project_id,
      file_count: filesData.file_count,
      tree,
      files: filesData.files, // Include flat list with content
      updated_at: filesData.updated_at,
    };
  }

  // ============================================================
  // Private Helper Methods
  // ============================================================

  /**
   * Format database model to DTO
   */
  private formatFileDto(file: any): ProjectFileDto {
    return {
      id: file.id,
      file_path: file.file_path,
      content: file.content,
      size_bytes: file.size_bytes,
      mime_type: file.mime_type,
      created_by_tool: file.created_by_tool,
      created_at: file.created_at?.toISOString() || new Date().toISOString(),
      updated_at: file.updated_at?.toISOString() || new Date().toISOString(),
    };
  }

  /**
   * Build hierarchical tree structure from flat file paths
   */
  private buildFileTree(files: ProjectFileDto[]): FileTreeNode[] {
    const root: FileTreeNode[] = [];

    files.forEach((file) => {
      const parts = file.file_path.split('/');
      let currentLevel = root;

      parts.forEach((part, index) => {
        const isFile = index === parts.length - 1;
        const existingNode = currentLevel.find((node) => node.name === part);

        if (existingNode) {
          if (!isFile && existingNode.children) {
            currentLevel = existingNode.children;
          }
        } else {
          const newNode: FileTreeNode = {
            name: part,
            type: isFile ? 'file' : 'folder',
            path: parts.slice(0, index + 1).join('/'),
            children: isFile ? undefined : [],
            size_bytes: isFile ? file.size_bytes : undefined,
            file_id: isFile ? file.id : undefined,
            updated_at: isFile ? file.updated_at : undefined,
          };

          currentLevel.push(newNode);

          if (!isFile && newNode.children) {
            currentLevel = newNode.children;
          }
        }
      });
    });

    return this.sortTree(root);
  }

  /**
   * Sort tree: folders first, then alphabetically
   */
  private sortTree(nodes: FileTreeNode[]): FileTreeNode[] {
    return nodes
      .sort((a, b) => {
        // Folders first
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1;
        }
        // Then alphabetically
        return a.name.localeCompare(b.name);
      })
      .map((node) => {
        if (node.children) {
          node.children = this.sortTree(node.children);
        }
        return node;
      });
  }

  /**
   * Get latest timestamp from files array
   */
  private getLatestTimestamp(files: any[]): string {
    if (files.length === 0) {
      return new Date().toISOString();
    }

    const latest = files.reduce((max, file) => {
      const fileTime = file.updated_at?.getTime() || 0;
      return fileTime > max ? fileTime : max;
    }, 0);

    return new Date(latest).toISOString();
  }
}
