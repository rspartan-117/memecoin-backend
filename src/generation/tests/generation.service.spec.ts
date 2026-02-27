import { Test, TestingModule } from '@nestjs/testing';
import { GenerationService } from '../generation.service';
import { ImageGenerationService } from '../services/image-generation.service';
import { TextGenerationService } from '../services/text-generation.service';
import { ConfigService } from '@nestjs/config';
import {
    AIProvider,
    ImageSize,
    ImageQuality,
} from '../dto/generation.dto';

describe('GenerationService', () => {
    let service: GenerationService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                GenerationService,
                {
                    provide: ImageGenerationService,
                    useValue: {
                        generate: jest.fn(),
                    },
                },
                {
                    provide: TextGenerationService,
                    useValue: {
                        generate: jest.fn(),
                    },
                },
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = module.get<GenerationService>(GenerationService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('generateImage', () => {
        it('should generate an image successfully', async () => {
            const mockResult = {
                imageUrl: 'https://example.com/image.png',
                imageKey: 'generated/images/user123/123456.png',
                prompt: 'test prompt',
                provider: 'openai',
                size: '1024x1024',
                quality: 'standard',
                timestamp: new Date().toISOString(),
            };

            const imageService = service['imageGenerationService'];
            jest.spyOn(imageService, 'generate').mockResolvedValue(mockResult);

            const result = await service.generateImage(
                {
                    prompt: 'test prompt',
                    provider: AIProvider.OPENAI,
                    size: ImageSize.LARGE,
                    quality: ImageQuality.STANDARD,
                },
                'user123',
            );

            expect(result).toEqual(mockResult);
            expect(imageService.generate).toHaveBeenCalledWith(
                expect.objectContaining({ prompt: 'test prompt' }),
                'user123',
            );
        });
    });

    describe('generateText', () => {
        it('should generate text successfully', async () => {
            const mockResult = {
                content: 'Generated text content',
                prompt: 'test prompt',
                provider: 'openai',
                tokensUsed: 100,
                timestamp: new Date().toISOString(),
            };

            const textService = service['textGenerationService'];
            jest.spyOn(textService, 'generate').mockResolvedValue(mockResult);

            const result = await service.generateText(
                {
                    prompt: 'test prompt',
                    provider: AIProvider.OPENAI,
                    maxTokens: 1000,
                    temperature: 0.7,
                },
                'user123',
            );

            expect(result).toEqual(mockResult);
            expect(textService.generate).toHaveBeenCalledWith(
                expect.objectContaining({ prompt: 'test prompt' }),
                'user123',
            );
        });
    });
});
