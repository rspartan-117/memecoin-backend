import {
  Controller,
  Post,
  Body,
  Req,
  HttpStatus,
  Logger,
  UseGuards,
  HttpException,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { SandboxService } from '../services/sandbox.service';
import { SandboxUrlsResponseDto, SandboxUrlRequestDto } from '../dtos';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';

@ApiTags('Sandbox Management')
@Controller('sandbox')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class SandboxController {
  private readonly logger = new Logger(SandboxController.name);

  constructor(private readonly sandboxService: SandboxService) {}

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
  // POST /sandbox/public-url - Get sandbox URL for specific port
  // ============================================================

  @Post('public-url')
  @ApiOperation({
    summary: 'Get sandbox public URL',
    description:
      'Get the public URL for a specific port (3000 for frontend, 8000 for backend)',
  })
  @ApiBody({
    type: SandboxUrlRequestDto,
    description: 'Request body containing project_id and port',
  })
  @ApiResponse({
    status: 200,
    description: 'Sandbox URL retrieved successfully',
    type: SandboxUrlsResponseDto,
  })
  async getPublicUrl(
    @Req() req: Request,
    @Body() body: SandboxUrlRequestDto,
  ): Promise<SandboxUrlsResponseDto> {
    try {
      if (!body.project_id) {
        throw new BadRequestException('project_id is required');
      }

      if (!body.port) {
        throw new BadRequestException('port is required');
      }

      if (body.port !== 3000 && body.port !== 8000) {
        throw new BadRequestException('port must be 3000 or 8000');
      }

      const userId = this.extractUserId(req);
      this.logger.log(
        `Getting public URL for project ${body.project_id}, user ${userId}, port ${body.port}`,
      );

      return await this.sandboxService.getSandboxUrl(
        body.project_id,
        userId,
        body.port,
      );
    } catch (error) {
      this.logger.error(`Get public URL error: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Failed to get sandbox URL',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
