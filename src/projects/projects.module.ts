import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ProjectsController } from './controllers/projects.controller';
import { AssetsController } from './controllers/assets.controller';
import { DownloadController } from './controllers/download.controller';
import { SandboxController } from './controllers/sandbox.controller';
import { ChatController } from './controllers/chat.controller';
import { E2bWebhookController } from './controllers/e2b-webhook.controller';
import { FilesController } from './controllers/files.controller';
import { ProjectsService } from './services/projects.service';
import { SandboxService } from './services/sandbox.service';
import { ChatService } from './services/chat.service';
import { DownloadService } from './services/download.service';
import { AssetsService } from './services/assets.service';
import { E2bWebhookService } from './services/e2b-webhook.service';
import { FilesService } from './services/files.service';
import { SharedModule } from '../shared/shared.module';
import { DeploymentModule } from '../deployment/deployment.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 60000, // 60 second timeout for long-running operations
      maxRedirects: 5,
    }),
    ConfigModule,
    SharedModule,
    DeploymentModule,
  ],
  controllers: [
    ProjectsController,
    AssetsController,
    DownloadController,
    SandboxController,
    ChatController,
    E2bWebhookController,
    FilesController,
  ],
  providers: [
    ProjectsService,
    SandboxService,
    ChatService,
    DownloadService,
    AssetsService,
    E2bWebhookService,
    FilesService,
  ],
  exports: [
    ProjectsService,
    SandboxService,
    ChatService,
    DownloadService,
    AssetsService,
    E2bWebhookService,
    // CreditService is now provided and exported by SharedModule
  ],
})
export class ProjectsModule {}
