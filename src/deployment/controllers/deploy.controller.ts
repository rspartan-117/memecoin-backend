import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { DeployService } from '../services/deploy.service';
import { DeployToKoyebDto } from '../dto/deploy-to-koyeb.dto';

@Controller('deployment')
@ApiBearerAuth()
export class DeployController {
  private readonly logger = new Logger(DeployController.name);

  constructor(private readonly deployService: DeployService) {}

  /**
   * Extract userId from req.user (set by auth middleware as a string)
   */
  private extractUserId(req: Request): string {
    const userId = (req as any).user;
    if (!userId || typeof userId !== 'string') {
      throw new UnauthorizedException('User not authenticated');
    }
    return userId;
  }

  /**
   * POST /deployment/deploy
   * Enqueues a deployment job and returns immediately.
   */
  @Post('deploy')
  @HttpCode(HttpStatus.OK)
  async deployToKoyeb(@Body() dto: DeployToKoyebDto, @Req() req: Request) {
    const userId = this.extractUserId(req);
    this.logger.log(
      `Deploy request from user ${userId} for project ${dto.projectId}`,
    );
    return this.deployService.deployToKoyeb(dto, userId);
  }

  /**
   * POST /deployment/deploy/stream
   * Enqueues deployment job AND streams SSE progress events to the client.
   */
  @Post('deploy/stream')
  @HttpCode(HttpStatus.OK)
  async streamDeployToKoyeb(
    @Body() dto: DeployToKoyebDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const userId = this.extractUserId(req);
    this.logger.log(`Stream deploy request from user ${userId}`);
    return this.deployService.streamDeployToKoyeb(dto, userId, req, res);
  }

  /**
   * GET /deployment/status/:deploymentId
   * Returns the current status / progress of a deployment.
   */
  @Get('status/:deploymentId')
  async getDeploymentStatus(
    @Param('deploymentId') deploymentId: string,
    @Req() req: Request,
  ) {
    const userId = this.extractUserId(req);
    return this.deployService.getDeploymentStatus(deploymentId, userId);
  }

  /**
   * GET /deployment/user
   * Returns all deployments for the authenticated user.
   */
  @Get('user')
  async getUserDeployments(@Req() req: Request) {
    const userId = this.extractUserId(req);
    return this.deployService.getUserDeployments(userId);
  }

  /**
   * POST /deployment/domain/verify/:deploymentId
   * Triggers domain verification (refreshes DNS/TLS status in SaaS Custom Domains).
   */
  @Post('domain/verify/:deploymentId')
  @HttpCode(HttpStatus.OK)
  async verifyCustomDomain(
    @Param('deploymentId') deploymentId: string,
    @Req() req: Request,
  ) {
    const userId = this.extractUserId(req);
    this.logger.log(
      `Domain verify request for deployment ${deploymentId} by user ${userId}`,
    );
    return this.deployService.verifyCustomDomain(deploymentId, userId);
  }

  /**
   * GET /deployment/domain/:deploymentId
   * Returns the current custom domain configuration and status.
   */
  @Get('domain/:deploymentId')
  async getCustomDomainStatus(
    @Param('deploymentId') deploymentId: string,
    @Req() req: Request,
  ) {
    const userId = this.extractUserId(req);
    return this.deployService.getCustomDomainStatus(deploymentId, userId);
  }

  /**
   * DELETE /deployment/domain/:deploymentId
   * Detaches the custom domain from a deployment and removes it from SaaS Custom Domains.
   */
  @Delete('domain/:deploymentId')
  @HttpCode(HttpStatus.OK)
  async removeCustomDomain(
    @Param('deploymentId') deploymentId: string,
    @Req() req: Request,
  ) {
    const userId = this.extractUserId(req);
    this.logger.log(
      `Domain removal request for deployment ${deploymentId} by user ${userId}`,
    );
    return this.deployService.removeCustomDomain(deploymentId, userId);
  }

  /**
   * GET /deployment/logs/:deploymentId
   * Streams live Koyeb logs (SSE) for a deployment.
   * Query params:
   *   - which: 'all' | 'backend' | 'frontend' (default: 'all')
   *   - types: comma-separated 'runtime,build' (default: 'runtime,build')
   */
  @Get('logs/:deploymentId')
  async streamLogs(
    @Param('deploymentId') deploymentId: string,
    @Query('which') which: 'all' | 'backend' | 'frontend' = 'all',
    @Query('types') types: string = 'runtime,build',
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const userId = this.extractUserId(req);
    this.logger.log(
      `Log stream request for deployment ${deploymentId} by user ${userId}`,
    );
    return this.deployService.streamDeploymentLogs(
      deploymentId,
      userId,
      which,
      types,
      req,
      res,
    );
  }
}
