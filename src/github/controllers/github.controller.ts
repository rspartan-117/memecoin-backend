import {
  Controller,
  Post,
  Get,
  Delete,
  Query,
  Param,
  Body,
  Req,
  UseGuards,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { GithubService } from '../services/github.service';
import { Request } from 'express';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import {
  GithubAuthDto,
  GithubMessageResponseDto,
  PushToGithubRequestDto,
  PushToGithubResponseDto,
  CloneRepoRequestDto,
  CloneRepoResponseDto,
  GithubRepoListDto,
  GithubUserInfoDto,
} from '../dto/github.dto';

@ApiTags('github')
@Controller('github')
export class GithubController {
  constructor(private readonly githubService: GithubService) {}

  @Get('auth')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Initiate GitHub OAuth flow',
    description:
      'Generate GitHub OAuth authorization URL for connecting user account',
  })
  @ApiOkResponse({
    type: GithubAuthDto,
    description: 'Returns OAuth URL and state parameter',
  })
  getAuthUrl() {
    return this.githubService.getAuthUrl();
  }

  @Get('callback')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'GitHub OAuth callback',
    description: 'Handle OAuth callback from GitHub and store access token',
  })
  @ApiQuery({
    name: 'code',
    required: true,
    description: 'Authorization code from GitHub',
  })
  @ApiOkResponse({
    type: GithubMessageResponseDto,
    description: 'GitHub account connected successfully',
  })
  async handleCallback(@Query('code') code: string, @Req() req: Request) {
    const userId = this.extractUserId(req);
    return this.githubService.handleOAuthCallback(code, userId);
  }

  @Post('push')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Push generated app to GitHub',
    description: 'Generate fullstack app and push to a new GitHub repository',
  })
  @ApiBody({ type: PushToGithubRequestDto })
  @ApiOkResponse({
    type: PushToGithubResponseDto,
    description: 'Code pushed successfully to GitHub',
  })
  async pushToGithub(
    @Body() body: PushToGithubRequestDto,
    @Req() req: Request,
  ) {
    const userId = this.extractUserId(req);
    return this.githubService.pushToGithub(
      userId,
      body.projectId,
      body.appName,
      body.repoName,
    );
  }

  @Post('clone')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Clone repository from GitHub',
    description: 'Clone a GitHub repository to local storage',
  })
  @ApiBody({ type: CloneRepoRequestDto })
  @ApiOkResponse({
    type: CloneRepoResponseDto,
    description: 'Repository cloned successfully',
  })
  async cloneRepo(@Body() body: CloneRepoRequestDto, @Req() req: Request) {
    const userId = this.extractUserId(req);
    return this.githubService.cloneRepo(body.repoUrl, userId);
  }

  @Get('repos')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get user GitHub repositories',
    description: 'List all repositories for authenticated GitHub user',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'perPage',
    required: false,
    type: Number,
    description: 'Items per page (default: 30, max: 100)',
  })
  @ApiOkResponse({
    type: GithubRepoListDto,
    description: 'List of GitHub repositories',
  })
  async getUserRepos(
    @Req() req: Request,
    @Query('page') page?: number,
    @Query('perPage') perPage?: number,
  ) {
    const userId = this.extractUserId(req);
    return this.githubService.getUserRepos(
      userId,
      page ? Number(page) : 1,
      perPage ? Number(perPage) : 30,
    );
  }

  @Get('info')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get GitHub connection info',
    description:
      'Get current user GitHub account information and connection status',
  })
  @ApiOkResponse({
    type: GithubUserInfoDto,
    description: 'GitHub user information',
  })
  async getGithubInfo(@Req() req: Request) {
    const userId = this.extractUserId(req);
    return this.githubService.getGithubUserInfo(userId);
  }

  @Get('cloned')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get cloned repositories',
    description: 'List all repositories cloned by the user',
  })
  @ApiOkResponse({
    description: 'List of cloned repositories',
  })
  async getClonedRepos(@Req() req: Request) {
    const userId = this.extractUserId(req);
    return this.githubService.getClonedRepos(userId);
  }

  @Delete('cloned/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete cloned repository',
    description: 'Delete a cloned repository from local storage',
  })
  @ApiParam({
    name: 'id',
    description: 'Cloned repository ID',
  })
  @ApiOkResponse({
    type: GithubMessageResponseDto,
    description: 'Repository deleted successfully',
  })
  async deleteClonedRepo(@Param('id') repoId: string, @Req() req: Request) {
    const userId = this.extractUserId(req);
    return this.githubService.deleteClonedRepo(repoId, userId);
  }

  @Post('disconnect')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Disconnect GitHub account',
    description: 'Remove GitHub integration and delete stored tokens',
  })
  @ApiOkResponse({
    type: GithubMessageResponseDto,
    description: 'GitHub account disconnected successfully',
  })
  async disconnectGithub(@Req() req: Request) {
    const userId = this.extractUserId(req);
    return this.githubService.disconnectGithub(userId);
  }

  @Get('connected')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Check GitHub connection status',
    description: 'Check if user has connected their GitHub account',
  })
  @ApiOkResponse({
    description: 'Connection status',
    schema: {
      type: 'object',
      properties: {
        connected: { type: 'boolean' },
      },
    },
  })
  async checkConnection(@Req() req: Request) {
    const userId = this.extractUserId(req);
    const connected = await this.githubService.isGithubConnected(userId);
    return { connected };
  }

  private extractUserId(req: Request): string {
    const user = (req as any).user;

    if (!user) {
      throw new UnauthorizedException(
        'User information is missing from request',
      );
    }

    // Handle different possible user object structures
    const userId = typeof user === 'string' ? user : user?.id || user?.userId;

    if (!userId || typeof userId !== 'string') {
      throw new UnauthorizedException('Invalid user information in request');
    }

    return userId;
  }
}
