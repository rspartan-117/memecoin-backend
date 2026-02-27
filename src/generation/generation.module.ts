import { Module } from '@nestjs/common';
import { GenerationController } from './generation.controller';
import { BrandController } from './controllers/brand.controller';
import { GenerationService } from './services/generation.service';
import { GenerationConfigService } from './services/generation-config.service';
import { BrandService } from './services/brand.service';
import { SharedModule } from '../shared/shared.module';

@Module({
    imports: [SharedModule],
    controllers: [GenerationController, BrandController],
    providers: [GenerationService, GenerationConfigService, BrandService],
    exports: [GenerationService, GenerationConfigService, BrandService],
})
export class GenerationModule {}
