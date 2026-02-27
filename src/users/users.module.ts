import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaService } from 'src/shared/services/prisma.service';
import { CacheService } from 'src/shared/services/redis-cache.service';
import { ProjectsModule } from 'src/projects/projects.module';

@Module({
  imports: [ProjectsModule],
  controllers: [UsersController],
  providers: [UsersService, PrismaService, CacheService],
})
export class UsersModule {}
