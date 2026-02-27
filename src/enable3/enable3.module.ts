import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Enable3Controller } from './enable3.controller';
import { Enable3Service } from './enable3.service';
import { PrismaService } from 'src/shared/services/prisma.service';

@Module({
  imports: [ConfigModule],
  controllers: [Enable3Controller],
  providers: [Enable3Service, PrismaService],
  exports: [Enable3Service],
})
export class Enable3Module {}
