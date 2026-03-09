// services/github.service.ts
import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../shared/services/prisma.service';
import { Octokit } from 'octokit';
import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as AdmZip from 'adm-zip';

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly zipStorageDir: string;
  private readonly unzipStorageDir: string;
  private readonly cloneDir: string;
  private readonly projectApiUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.clientId = this.configService.get<string>('GITHUB_CLIENT_ID') || '';
    this.clientSecret =
      this.configService.get<string>('GITHUB_CLIENT_SECRET') || '';
    this.redirectUri =
      this.configService.get<string>('GITHUB_REDIRECT_URI') || '';

    this.zipStorageDir = path.resolve(process.cwd(), 'zipstorage');
    this.unzipStorageDir = path.resolve(process.cwd(), 'unzipstorage');
    this.cloneDir = path.resolve(process.cwd(), 'storage', 'cloned_repos');

    // API URL — same Python backend used by the projects module
    this.projectApiUrl =
      this.configService.get<string>('PYTHON_API_URL') ||
      'http://localhost:8000';

    this.initializeDirectories();
  }

  private async initializeDirectories() {
    try {
      const dirs = [
        this.zipStorageDir,
        this.unzipStorageDir,
        this.cloneDir,
        path.resolve(process.cwd(), 'storage'),
      ];

      for (const dir of dirs) {
        if (!fsSync.existsSync(dir)) {
          await fs.mkdir(dir, { recursive: true });
        }
      }
    } catch (error) {
      this.logger.error('Failed to initialize directories', error);
    }
  }

  getAuthUrl() {
    const state = crypto.randomBytes(16).toString('hex');
    const scopes = ['repo', 'user:email', 'read:user'];

    const authUrl = new URL('https://github.com/login/oauth/authorize');
    authUrl.searchParams.set('client_id', this.clientId);
    authUrl.searchParams.set('redirect_uri', this.redirectUri);
    authUrl.searchParams.set('scope', scopes.join(' '));
    authUrl.searchParams.set('state', state);

    return { authUrl: authUrl.toString(), state };
  }

  async handleOAuthCallback(code: string, userId: string) {
    if (!code) {
      throw new BadRequestException('Authorization code is required');
    }

    try {
      const tokenResponse = await fetch(
        'https://github.com/login/oauth/access_token',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            client_id: this.clientId,
            client_secret: this.clientSecret,
            code,
            redirect_uri: this.redirectUri,
          }),
        },
      );

      if (!tokenResponse.ok)
        throw new InternalServerErrorException(
          'Failed to exchange code for token',
        );

      const tokenData = await tokenResponse.json();
      if (tokenData.error)
        throw new BadRequestException(
          `GitHub OAuth error: ${tokenData.error_description || tokenData.error}`,
        );
      if (!tokenData.access_token)
        throw new InternalServerErrorException(
          'No access token received from GitHub',
        );

      const accessToken = tokenData.access_token;
      const octokit = new Octokit({ auth: accessToken });
      const { data: userData } = await octokit.rest.users.getAuthenticated();

      await this.prisma.users.update({
        where: { id: userId },
        data: {
          githubToken: accessToken,
          githubUsername: userData.login,
        },
      });

      this.logger.log(`GitHub connected for user ${userId}: ${userData.login}`);

      return {
        message: 'GitHub account connected successfully',
        username: userData.login,
        avatarUrl: userData.avatar_url,
      };
    } catch (error) {
      this.logger.error('OAuth callback error:', error);
      throw new InternalServerErrorException(
        'Failed to authenticate with GitHub',
      );
    }
  }

  private async getUserGithubToken(userId: string): Promise<string> {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { githubToken: true },
    });

    if (!user?.githubToken) {
      throw new UnauthorizedException(
        'GitHub account not connected. Please connect first.',
      );
    }

    return user.githubToken;
  }

  async isGithubConnected(userId: string): Promise<boolean> {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { githubToken: true, githubUsername: true },
    });
    return !!(user?.githubToken && user?.githubUsername);
  }

  async getGithubUserInfo(userId: string) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { githubToken: true, githubUsername: true },
    });

    if (!user?.githubToken) return { connected: false };

    try {
      const octokit = new Octokit({ auth: user.githubToken });
      const { data: githubUser } = await octokit.rest.users.getAuthenticated();
      return {
        connected: true,
        username: githubUser.login,
        name: githubUser.name,
        avatarUrl: githubUser.avatar_url,
        email: githubUser.email,
        publicRepos: githubUser.public_repos,
      };
    } catch (error) {
      this.logger.error('Failed to fetch GitHub user info:', error);
      return {
        connected: true,
        username: user.githubUsername,
        error: 'Could not fetch latest info',
      };
    }
  }

  /**
   * Create zip file using signed download URL
   */
  private async createZipFile(
    projectId: string,
    appName: string,
    userId: string,
  ): Promise<string> {
    // Endpoint: POST /api/projects/download  (project_id in BODY, not path)
    const downloadEndpoint = `${this.projectApiUrl}/api/projects/download`;
    const zipFileName = `${userId}_${projectId}_${appName}.zip`;
    const zipFilePath = path.join(this.zipStorageDir, zipFileName);

    this.logger.log(
      `Requesting ZIP from: ${downloadEndpoint} for project ${projectId}`,
    );

    try {
      const response = await fetch(downloadEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          project_id: projectId,
          use_defaults: true,
          source_path: null,
          zip_name: null,
          exclude_patterns: null,
          url_expiration: null,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`ZIP creation failed: ${response.status} - ${errText}`);
      }

      const data = await response.json();
      if (!data.success || !data.download_url)
        throw new Error(
          `Invalid response from ZIP API: ${JSON.stringify(data)}`,
        );

      this.logger.log(`ZIP ready: ${data.filename}`);
      this.logger.log(`Download URL: ${data.download_url}`);

      const downloadResponse = await fetch(data.download_url);
      if (!downloadResponse.ok) {
        const errText = await downloadResponse.text();
        throw new Error(
          `Failed to download ZIP: ${downloadResponse.status} - ${errText}`,
        );
      }

      const buffer = Buffer.from(await downloadResponse.arrayBuffer());
      if (buffer.length === 0) throw new Error('Downloaded ZIP is empty');

      const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
      if (!isZip) this.logger.warn('File may not be a valid ZIP archive');

      fsSync.writeFileSync(zipFilePath, buffer);
      this.logger.log(`ZIP saved: ${zipFilePath}`);

      return zipFilePath;
    } catch (error) {
      this.logger.error(`Failed to create/download ZIP: ${error.message}`);
      throw new InternalServerErrorException(
        `ZIP creation failed: ${error.message}`,
      );
    }
  }

  private extractZipFile(zipFilePath: string, unzipDir: string) {
    if (fsSync.existsSync(unzipDir))
      fsSync.rmSync(unzipDir, { recursive: true, force: true });
    fsSync.mkdirSync(unzipDir, { recursive: true });

    const zip = new AdmZip(zipFilePath);
    zip.extractAllTo(unzipDir, true);

    const items = fsSync.readdirSync(unzipDir);
    if (
      items.length === 1 &&
      fsSync.statSync(path.join(unzipDir, items[0])).isDirectory()
    ) {
      const nestedDir = path.join(unzipDir, items[0]);
      const nestedItems = fsSync.readdirSync(nestedDir);
      for (const item of nestedItems) {
        fsSync.renameSync(
          path.join(nestedDir, item),
          path.join(unzipDir, item),
        );
      }
      fsSync.rmdirSync(nestedDir);
    }

    this.logger.log(`Zip extracted successfully to: ${unzipDir}`);
  }

  async pushToGithub(
    userId: string,
    projectId: string,
    appName: string,
    repoName?: string,
  ) {
    const githubToken = await this.getUserGithubToken(userId);
    this.logger.log(
      `Starting GitHub push for ${userId}_${projectId}_${appName}`,
    );

    // Check if project already has a GitHub repo
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { githubRepoUrl: true },
    });

    if (!project) {
      throw new BadRequestException(`Project with ID ${projectId} not found`);
    }

    // If project already has a GitHub repo, push to existing repo
    if (project.githubRepoUrl) {
      this.logger.log(
        `Project already has GitHub repo: ${project.githubRepoUrl}`,
      );
      return await this.pushToExistingRepo(
        userId,
        projectId,
        appName,
        project.githubRepoUrl,
        githubToken,
      );
    }

    // Otherwise, create new repo
    let zipFilePath: string;
    try {
      zipFilePath = await this.createZipFile(projectId, appName, userId);
    } catch (error) {
      throw new BadRequestException(
        `Failed to generate app files: ${error.message}`,
      );
    }

    if (!fsSync.existsSync(zipFilePath))
      throw new BadRequestException('Zip file not found after creation');

    const unzipDir = path.join(
      this.unzipStorageDir,
      `${userId}_${projectId}_${appName}_${Date.now()}`,
    );

    try {
      this.extractZipFile(zipFilePath, unzipDir);

      const files = fsSync.readdirSync(unzipDir);
      if (files.length === 0)
        throw new BadRequestException('Generated app folder is empty');

      const octokit = new Octokit({ auth: githubToken });
      const finalRepoName =
        repoName?.replace(/[^a-zA-Z0-9-_]/g, '-') || appName;

      this.logger.log(`Creating GitHub repository: ${finalRepoName}`);
      const { data: repoData } =
        await octokit.rest.repos.createForAuthenticatedUser({
          name: finalRepoName,
          private: false,
          description: `Auto-generated fullstack application`,
          auto_init: false,
        });

      const tokenRepoUrl = repoData.clone_url.replace(
        'https://',
        `https://${githubToken}@`,
      );
      this.logger.log(`Created GitHub repo: ${repoData.full_name}`);

      await this.setupProjectFiles(unzipDir);
      await this.initializeGitAndPush(unzipDir, tokenRepoUrl, finalRepoName);

      this.logger.log(`Code pushed to GitHub: ${repoData.html_url}`);

      // Update project with GitHub repo URL
      await this.prisma.project.update({
        where: { id: projectId },
        data: { githubRepoUrl: repoData.html_url },
      });

      // Also update deployment if it exists
      const deployment = await this.prisma.deployment.findUnique({
        where: { projectId },
      });
      if (deployment && !deployment.githubRepoUrl) {
        await this.prisma.deployment.update({
          where: { projectId },
          data: { githubRepoUrl: repoData.html_url },
        });
      }

      // Local cleanup
      if (fsSync.existsSync(zipFilePath)) {
        fsSync.unlinkSync(zipFilePath);
        this.logger.log(`Deleted ZIP: ${zipFilePath}`);
      }
      if (fsSync.existsSync(unzipDir)) {
        fsSync.rmSync(unzipDir, { recursive: true, force: true });
        this.logger.log(`Deleted extracted folder: ${unzipDir}`);
      }

      return {
        message: 'Code pushed successfully to GitHub',
        repoUrl: repoData.html_url,
        repoName: repoData.name,
        cloneUrl: repoData.clone_url,
        fullName: repoData.full_name,
      };
    } catch (error) {
      this.logger.error('GitHub push failed:', error);
      if (fsSync.existsSync(zipFilePath)) fsSync.unlinkSync(zipFilePath);
      if (fsSync.existsSync(unzipDir))
        fsSync.rmSync(unzipDir, { recursive: true, force: true });
      throw new InternalServerErrorException(
        `Failed to push to GitHub: ${error.message}`,
      );
    }
  }

  async cloneRepo(repoUrl: string, userId: string) {
    if (!repoUrl.includes('github.com'))
      throw new BadRequestException('Invalid GitHub repository URL');
    const githubToken = await this.getUserGithubToken(userId);

    try {
      const urlMatch = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
      if (!urlMatch)
        throw new BadRequestException('Could not parse repository URL');

      const repoName = urlMatch[2].replace('.git', '');
      const localPath = path.join(
        this.cloneDir,
        `${userId}_${repoName}_${Date.now()}`,
      );

      const normalizedUrl = repoUrl
        .replace('git@github.com:', 'https://github.com/')
        .replace('.git', '');
      const authenticatedUrl = normalizedUrl.replace(
        'https://',
        `https://${githubToken}@`,
      );

      this.logger.log(`Cloning to: ${localPath}`);
      execSync(`git clone --depth 1 "${authenticatedUrl}" "${localPath}"`, {
        stdio: 'pipe',
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        timeout: 300000,
      });

      const gitFolder = path.join(localPath, '.git');
      if (fsSync.existsSync(gitFolder))
        await fs.rm(gitFolder, { recursive: true, force: true });

      await this.prisma.clonedRepository.create({
        data: {
          userId,
          repoUrl: normalizedUrl,
          repoName,
          localPath,
          clonedAt: new Date(),
        },
      });

      this.logger.log(`Repository cloned successfully: ${repoName}`);
      return {
        message: 'Repository cloned successfully',
        localPath,
        repoName,
      };
    } catch (error) {
      this.logger.error('Clone failed:', error);
      throw new InternalServerErrorException(
        `Failed to clone repository: ${error.message}`,
      );
    }
  }

  async getUserRepos(userId: string, page = 1, perPage = 30) {
    const githubToken = await this.getUserGithubToken(userId);
    if (page < 1 || perPage < 1 || perPage > 100)
      throw new BadRequestException('Invalid pagination parameters');

    try {
      const octokit = new Octokit({ auth: githubToken });
      const { data: repos } = await octokit.rest.repos.listForAuthenticatedUser(
        {
          sort: 'updated',
          per_page: perPage,
          page,
          type: 'all',
        },
      );

      return {
        count: repos.length,
        page,
        perPage,
        repositories: repos.map((repo) => ({
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description,
          htmlUrl: repo.html_url,
          cloneUrl: repo.clone_url,
          private: repo.private,
          language: repo.language,
          stargazersCount: repo.stargazers_count,
          forksCount: repo.forks_count,
          createdAt: repo.created_at,
          updatedAt: repo.updated_at,
        })),
      };
    } catch (error) {
      this.logger.error('Failed to fetch repositories:', error);
      throw new InternalServerErrorException(
        'Failed to fetch GitHub repositories',
      );
    }
  }

  async getClonedRepos(userId: string) {
    const clonedRepos = await this.prisma.clonedRepository.findMany({
      where: { userId },
      orderBy: { clonedAt: 'desc' },
      select: {
        id: true,
        repoUrl: true,
        repoName: true,
        localPath: true,
        clonedAt: true,
      },
    });

    return { count: clonedRepos.length, repositories: clonedRepos };
  }

  async deleteClonedRepo(repoId: string, userId: string) {
    const repo = await this.prisma.clonedRepository.findFirst({
      where: { id: repoId, userId },
    });
    if (!repo) throw new BadRequestException('Repository not found');

    try {
      if (fsSync.existsSync(repo.localPath)) {
        await fs.rm(repo.localPath, { recursive: true, force: true });
        this.logger.log(`Deleted repository files: ${repo.localPath}`);
      }
      await this.prisma.clonedRepository.delete({
        where: { id: repoId },
      });
      return { message: 'Repository deleted successfully' };
    } catch (error) {
      this.logger.error('Failed to delete repository:', error);
      throw new InternalServerErrorException('Failed to delete repository');
    }
  }

  async disconnectGithub(userId: string) {
    try {
      await this.prisma.users.update({
        where: { id: userId },
        data: { githubToken: null, githubUsername: null },
      });
      this.logger.log(`GitHub disconnected for user: ${userId}`);
      return { message: 'GitHub account disconnected successfully' };
    } catch (error) {
      this.logger.error('Failed to disconnect GitHub:', error);
      throw new InternalServerErrorException(
        'Failed to disconnect GitHub account',
      );
    }
  }

  private async setupProjectFiles(workDir: string) {
    const backendDir = path.join(workDir, 'backend');
    const frontendDir = path.join(workDir, 'frontend');
    const gitFolder = path.join(workDir, '.git');
    if (fsSync.existsSync(gitFolder))
      await fs.rm(gitFolder, { recursive: true, force: true });

    // README
    const readme = `# Fullstack Application

This project was auto-generated and pushed to GitHub.

## Structure
- \`backend/\` - Backend API
- \`frontend/\` - Frontend application

## Getting Started

### Backend
\`\`\`bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
\`\`\`

### Frontend
\`\`\`bash
cd frontend
npm install
npm run dev
\`\`\`
`;
    await fs.writeFile(path.join(workDir, 'README.md'), readme);

    // .gitignore
    const gitignore = `# Dependencies
node_modules/
__pycache__/
*.pyc
.env
.env.local
.next/
dist/
build/
*.log
.DS_Store
`;
    await fs.writeFile(path.join(workDir, '.gitignore'), gitignore);

    // Backend package.json
    if (fsSync.existsSync(backendDir)) {
      const backendPkg = path.join(backendDir, 'package.json');
      if (!fsSync.existsSync(backendPkg)) {
        const pkg = {
          name: 'backend',
          version: '1.0.0',
          main: 'main.py',
          scripts: {
            start: 'uvicorn main:app --host 0.0.0.0 --port 8000',
          },
          dependencies: {},
        };
        await fs.writeFile(backendPkg, JSON.stringify(pkg, null, 2));
      }
    }

    // Frontend package.json
    if (fsSync.existsSync(frontendDir)) {
      const frontendPkg = path.join(frontendDir, 'package.json');
      if (!fsSync.existsSync(frontendPkg)) {
        const pkg = {
          name: 'frontend',
          version: '0.1.0',
          private: true,
          scripts: {
            dev: 'next dev',
            build: 'next build',
            start: 'next start',
            lint: 'next lint',
          },
          dependencies: {
            next: '^14.0.0',
            react: '^18',
            'react-dom': '^18',
          },
          engines: { node: '>=18.0.0' },
        };
        await fs.writeFile(frontendPkg, JSON.stringify(pkg, null, 2));
      }

      // next.config.js
      const nextConfig = path.join(frontendDir, 'next.config.js');
      if (!fsSync.existsSync(nextConfig)) {
        const content = `const nextConfig={output:'standalone',env:{NEXT_PUBLIC_BACKEND_URL:process.env.NEXT_PUBLIC_BACKEND_URL}};module.exports=nextConfig;`;
        await fs.writeFile(nextConfig, content);
      }
    }
  }

  private async initializeGitAndPush(
    workDir: string,
    tokenRepoUrl: string,
    repoName: string,
  ) {
    try {
      // Initialize git repository FIRST
      execSync('git init', { cwd: workDir, stdio: 'pipe' });

      // Then configure git settings
      execSync('git config user.email "bot@generated-app.com"', {
        cwd: workDir,
      });
      execSync('git config user.name "App Generator"', { cwd: workDir });

      // Add files and commit
      execSync('git add .', { cwd: workDir, stdio: 'pipe' });
      execSync(`git commit -m "Initial commit: ${repoName}"`, {
        cwd: workDir,
        stdio: 'pipe',
      });
      execSync('git branch -M main', { cwd: workDir, stdio: 'pipe' });

      // Add remote
      try {
        execSync(`git remote add origin "${tokenRepoUrl}"`, {
          cwd: workDir,
          stdio: 'pipe',
        });
      } catch {
        execSync(`git remote set-url origin "${tokenRepoUrl}"`, {
          cwd: workDir,
          stdio: 'pipe',
        });
      }

      // Push to GitHub
      execSync('git push -u origin main --force', {
        cwd: workDir,
        stdio: 'pipe',
        timeout: 300000,
      });
      this.logger.log('Git push completed successfully');
    } catch (error) {
      this.logger.error('Git operation failed:', error);
      throw new Error(`Git operation failed: ${error.message}`);
    }
  }

  private async pushToExistingRepo(
    userId: string,
    projectId: string,
    appName: string,
    githubRepoUrl: string,
    githubToken: string,
  ) {
    this.logger.log(`Pushing to existing GitHub repo: ${githubRepoUrl}`);

    let zipFilePath: string;
    try {
      zipFilePath = await this.createZipFile(projectId, appName, userId);
    } catch (error) {
      throw new BadRequestException(
        `Failed to generate app files: ${error.message}`,
      );
    }

    if (!fsSync.existsSync(zipFilePath))
      throw new BadRequestException('Zip file not found after creation');

    const unzipDir = path.join(
      this.unzipStorageDir,
      `${userId}_${projectId}_${appName}_${Date.now()}`,
    );

    try {
      this.extractZipFile(zipFilePath, unzipDir);

      const files = fsSync.readdirSync(unzipDir);
      if (files.length === 0)
        throw new BadRequestException('Generated app folder is empty');

      // Extract repo name from URL (e.g., https://github.com/user/repo-name)
      const repoMatch = githubRepoUrl.match(/github\.com\/[^/]+\/([^/]+)/);
      if (!repoMatch) {
        throw new BadRequestException('Invalid GitHub repository URL');
      }
      const repoName = repoMatch[1];

      // Clone URL with token
      const cloneUrl = githubRepoUrl
        .replace('https://', `https://${githubToken}@`)
        .replace(/\.git$/, '');

      await this.setupProjectFiles(unzipDir);
      await this.initializeGitAndPush(unzipDir, cloneUrl, repoName);

      this.logger.log(`Code pushed to existing GitHub repo: ${githubRepoUrl}`);

      // Local cleanup
      if (fsSync.existsSync(zipFilePath)) {
        fsSync.unlinkSync(zipFilePath);
        this.logger.log(`Deleted ZIP: ${zipFilePath}`);
      }
      if (fsSync.existsSync(unzipDir)) {
        fsSync.rmSync(unzipDir, { recursive: true, force: true });
        this.logger.log(`Deleted extracted folder: ${unzipDir}`);
      }

      return {
        message: 'Code pushed successfully to existing GitHub repository',
        repoUrl: githubRepoUrl,
        repoName,
        cloneUrl: githubRepoUrl,
      };
    } catch (error) {
      this.logger.error('GitHub push to existing repo failed:', error);
      if (fsSync.existsSync(zipFilePath)) fsSync.unlinkSync(zipFilePath);
      if (fsSync.existsSync(unzipDir))
        fsSync.rmSync(unzipDir, { recursive: true, force: true });
      throw new InternalServerErrorException(
        `Failed to push to existing GitHub repo: ${error.message}`,
      );
    }
  }
}
