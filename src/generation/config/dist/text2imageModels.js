'use strict';
exports.__esModule = true;
exports.text2imageModels = void 0;
var THUMBNAIL_BASE_URL = process.env.THUMBNAIL_BASE_URL || '';
exports.text2imageModels = [
    {
        modelNumber: 1,
        modelName: 'fal-ai/flux-2/dev',
        endpoint: 'fal-ai/flux-2', // Official endpoint
        icon: 'Images/models-logo/flux.svg',
        credits: 2,
        type: 'Standard',

        // All inputs from official schema
        inputs: [
            'prompt',
            'guidance_scale',
            'seed',
            'num_inference_steps',
            'image_size',
            'num_images',
            'acceleration',
            'enable_prompt_expansion',
            'sync_mode',
            'enable_safety_checker',
            'output_format',
        ],

        required: ['prompt'],

        // guidance_scale configuration
        guidance_scale_min: 0,
        guidance_scale_max: 20,
        guidance_scale_step: 0.1,
        guidance_scale_default: 2.5, // Official default from schema

        // seed configuration
        seed_type: 'integer',
        seed_info: 'If not provided, a random seed will be used',

        // num_inference_steps configuration
        num_inference_steps_min: 1,
        num_inference_steps_max: 50,
        num_inference_steps_step: 1,
        num_inference_steps_default: 28, // Official default

        // image_size configuration (supports both enum and custom)
        image_size_type: 'enum | object',
        image_size_options: [
            'square_hd', // Preset sizes
            'square',
            'portrait_4_3',
            'portrait_16_9',
            'landscape_4_3',
            'landscape_16_9',
        ],
        image_size_custom: {
            enabled: true,
            format: {
                width: 'integer (512-2048)',
                height: 'integer (512-2048)',
            },
            example: {
                width: 1280,
                height: 720,
            },
        },
        image_size_default: 'landscape_4_3', // Official default

        // num_images configuration
        num_images_min: 1,
        num_images_max: 10, // Adjust based on your needs
        num_images_step: 1,
        num_images_default: 1, // Official default

        // acceleration configuration (NEW parameter)
        acceleration_type: 'enum',
        acceleration_options: ['none', 'regular', 'high'],
        acceleration_default: 'regular', // Official default
        acceleration_info: 'The acceleration level to use for image generation',

        // enable_prompt_expansion (NEW parameter)
        enable_prompt_expansion_type: 'boolean',
        enable_prompt_expansion_default: false,
        enable_prompt_expansion_info:
            'If set to true, the prompt will be expanded for better results',

        // sync_mode configuration
        sync_mode_type: 'boolean',
        sync_mode_default: false,
        sync_mode_info:
            'If True, media returned as data URI and output not saved in request history',

        // enable_safety_checker configuration
        enable_safety_checker_type: 'boolean',
        enable_safety_checker_default: true, // Official default

        // output_format configuration
        output_format_type: 'enum',
        output_format_options: ['jpeg', 'png', 'webp'],
        output_format_default: 'png', // Official default (you can override to webp)

        defaultValues: {
            prompt: '',
            guidance_scale: 2.5,
            seed: null,
            num_inference_steps: 28,
            image_size: 'landscape_4_3',
            num_images: 1,
            acceleration: 'regular',
            enable_prompt_expansion: false,
            sync_mode: false,
            enable_safety_checker: true,
            output_format: 'webp', // Your override for web optimization
        },

        // Output schema
        output: {
            images: {
                type: 'array',
                items: {
                    url: 'string',
                    content_type: 'string',
                    file_name: 'string',
                    file_size: 'integer',
                    width: 'integer',
                    height: 'integer',
                },
            },
            timings: 'object',
            seed: 'integer (used seed)',
            has_nsfw_concepts: 'array<boolean>',
            prompt: 'string (used prompt)',
        },

        thumbnail: THUMBNAIL_BASE_URL + '/flux2_dev.png',
        description:
            'FLUX.2 [dev] from Black Forest Labs. Enhanced realism, crisper text generation, and native editing capabilities.',
        bestFor: ['logos', 'mascots', 'hero-backgrounds', 'text-in-image'],
    },
    {
        modelNumber: 2,
        modelName: 'fal-ai/nano-banana',
        endpoint: 'fal-ai/nano-banana', // Official endpoint
        icon: 'Images/models-logo/nano_banana.svg',
        credits: 10,
        type: 'Premium',

        // All inputs from official schema
        inputs: [
            'prompt',
            'num_images',
            'seed',
            'aspect_ratio',
            'output_format',
            'safety_tolerance',
            'sync_mode',
            'limit_generations',
        ],

        required: ['prompt'],

        // prompt configuration
        prompt_info: 'The text prompt to generate an image from',

        // num_images configuration
        num_images_type: 'integer',
        num_images_min: 1,
        num_images_max: 10, // Adjust based on your limits
        num_images_step: 1,
        num_images_default: 1, // Official default

        // seed configuration
        seed_type: 'integer',
        seed_info: 'The seed for the random number generator (optional)',

        // aspect_ratio configuration (DIFFERENT from FLUX - uses ratio strings)
        aspect_ratio_type: 'enum',
        aspect_ratio_options: [
            '21:9', // Ultra-wide
            '16:9', // Widescreen
            '3:2', // Classic photo
            '4:3', // Standard
            '5:4', // Large format
            '1:1', // Square (default)
            '4:5', // Portrait standard
            '3:4', // Portrait photo
            '2:3', // Portrait classic
            '9:16', // Mobile portrait
        ],
        aspect_ratio_default: '1:1', // Official default
        aspect_ratio_info: 'The aspect ratio of the generated image',

        // output_format configuration
        output_format_type: 'enum',
        output_format_options: ['jpeg', 'png', 'webp'],
        output_format_default: 'png', // Official default

        // safety_tolerance configuration (UNIQUE to Nano Banana)
        safety_tolerance_type: 'enum',
        safety_tolerance_options: ['1', '2', '3', '4', '5', '6'],
        safety_tolerance_default: '4', // Official default
        safety_tolerance_info:
            '1 is most strict (blocks most), 6 is least strict',
        safety_tolerance_note: 'Only available through API calls',

        // sync_mode configuration
        sync_mode_type: 'boolean',
        sync_mode_default: false,
        sync_mode_info:
            'If True, media returned as data URI and output not saved in request history',

        // limit_generations (EXPERIMENTAL parameter)
        limit_generations_type: 'boolean',
        limit_generations_default: false,
        limit_generations_info:
            'Experimental: Limits generations per prompt round to 1, ignoring prompt instructions about number of images',

        defaultValues: {
            prompt: '',
            num_images: 1,
            seed: null,
            aspect_ratio: '1:1',
            output_format: 'webp', // Override for web optimization
            safety_tolerance: '4',
            sync_mode: false,
            limit_generations: false,
        },

        // Output schema
        output: {
            images: {
                type: 'array',
                items: {
                    url: 'string',
                    content_type: 'string',
                    file_name: 'string',
                    file_size: 'integer',
                    width: 'integer',
                    height: 'integer',
                },
            },
            description: 'string (AI-generated description of the images)',
        },

        thumbnail: THUMBNAIL_BASE_URL + '/nano_banana.png',
        description:
            "Gemini 2.5 Flash Image - Fast text-to-image generation powered by Google's Gemini. Simple configuration for quick concept generation.",
        bestFor: ['quick-concepts', 'exploration', 'rapid-prototyping'],

        modelInfo: {
            backend: 'Gemini 2.5 Flash',
            provider: 'Google AI',
            speed: 'Very Fast',
            complexity: 'Low (minimal parameters)',
        },
    },
    {
        modelNumber: 4,
        modelName: 'fal-ai/nano-banana-pro',
        endpoint: 'fal-ai/nano-banana-pro', // Official endpoint
        icon: 'Images/models-logo/nano_banana.svg',
        credits: 15, // Higher than regular nano-banana
        type: 'Premium',

        // All inputs from official schema
        inputs: [
            'prompt',
            'num_images',
            'seed',
            'aspect_ratio',
            'output_format',
            'safety_tolerance',
            'sync_mode',
            'resolution',
            'limit_generations',
            'enable_web_search',
        ],

        required: ['prompt'],

        // prompt configuration
        prompt_info: 'The text prompt to generate an image from',

        // num_images configuration
        num_images_type: 'integer',
        num_images_min: 1,
        num_images_max: 10,
        num_images_step: 1,
        num_images_default: 1, // Official default

        // seed configuration
        seed_type: 'integer',
        seed_info: 'The seed for the random number generator (optional)',

        // aspect_ratio configuration (INCLUDES 'auto' option)
        aspect_ratio_type: 'enum',
        aspect_ratio_options: [
            'auto', // NEW: Model decides based on prompt
            '21:9', // Ultra-wide
            '16:9', // Widescreen
            '3:2', // Classic photo
            '4:3', // Standard
            '5:4', // Large format
            '1:1', // Square (default)
            '4:5', // Portrait standard
            '3:4', // Portrait photo
            '2:3', // Portrait classic
            '9:16', // Mobile portrait
        ],
        aspect_ratio_default: '1:1', // Official default
        aspect_ratio_info: 'Use "auto" to let model decide based on prompt',

        // output_format configuration
        output_format_type: 'enum',
        output_format_options: ['jpeg', 'png', 'webp'],
        output_format_default: 'png', // Official default

        // safety_tolerance configuration
        safety_tolerance_type: 'enum',
        safety_tolerance_options: ['1', '2', '3', '4', '5', '6'],
        safety_tolerance_default: '4', // Official default
        safety_tolerance_info:
            '1 is most strict (blocks most), 6 is least strict',
        safety_tolerance_note: 'Only available through API calls',

        // sync_mode configuration
        sync_mode_type: 'boolean',
        sync_mode_default: false,
        sync_mode_info:
            'If True, media returned as data URI and output not saved',

        // resolution configuration (NEW - UNIQUE TO PRO)
        resolution_type: 'enum',
        resolution_options: ['1K', '2K', '4K'],
        resolution_default: '1K', // Official default
        resolution_info:
            'Higher resolution = better quality but slower generation',
        resolution_note: 'UNIQUE TO PRO VERSION',

        // limit_generations configuration
        limit_generations_type: 'boolean',
        limit_generations_default: false,
        limit_generations_info: 'Experimental: Forces single image per prompt',

        // enable_web_search (NEW - UNIQUE TO PRO)
        enable_web_search_type: 'boolean',
        enable_web_search_default: false,
        enable_web_search_info:
            'Allows model to use latest web info for generation',
        enable_web_search_note:
            'UNIQUE TO PRO VERSION - useful for current events/trends',

        defaultValues: {
            prompt: '',
            num_images: 1,
            seed: null,
            aspect_ratio: '1:1',
            output_format: 'webp', // Override for web optimization
            safety_tolerance: '4',
            sync_mode: false,
            resolution: '2K', // Good balance for meme coins
            limit_generations: false,
            enable_web_search: false,
        },

        // Output schema (same as regular nano-banana)
        output: {
            images: {
                type: 'array',
                items: {
                    url: 'string',
                    content_type: 'string',
                    file_name: 'string',
                    file_size: 'integer',
                    width: 'integer',
                    height: 'integer',
                },
            },
            description: 'string (AI-generated description of the images)',
        },

        thumbnail: THUMBNAIL_BASE_URL + '/nano_banana_pro.png',
        description:
            'Gemini 3 Pro Image - Advanced text-to-image with resolution control (1K-4K) and web search capabilities for current trends.',
        bestFor: ['high-quality-concepts', 'current-trends', 'detailed-images'],

        modelInfo: {
            backend: 'Gemini 3 Pro',
            provider: 'Google AI',
            speed: 'Fast (slower than base version)',
            complexity: 'Medium',
            upgradedFrom: 'Gemini 2.5 Flash (nano-banana)',
        },
    },
];
