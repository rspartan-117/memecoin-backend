const THUMBNAIL_BASE_URL = process.env.THUMBNAIL_BASE_URL || '';
export const image2imageModels = [
    {
        modelNumber: 1,
        modelName: 'fal-ai/nano-banana/edit',
        endpoint: 'fal-ai/nano-banana/edit', // Official endpoint
        icon: 'Images/models-logo/nano_banana.svg',
        credits: 15,
        type: 'Premium',
        category: 'image-to-image',

        // All inputs from official schema
        inputs: [
            'prompt',
            'image_urls',
            'num_images',
            'seed',
            'aspect_ratio',
            'output_format',
            'safety_tolerance',
            'sync_mode',
            'limit_generations',
        ],

        required: ['prompt', 'image_urls'],

        // prompt configuration
        prompt_info: 'The prompt for image editing/transformation',

        // image_urls configuration (CRITICAL - REQUIRED)
        image_urls_type: 'array<string>',
        image_urls_min: 1,
        image_urls_max: 10, // Can accept multiple reference images
        image_urls_info: 'Array of image URLs to use for editing',
        image_urls_formats: ['URL', 'Base64 data URI'],
        image_urls_example: [
            'https://storage.googleapis.com/falserverless/example_inputs/nano-banana-edit-input.png',
            'https://storage.googleapis.com/falserverless/example_inputs/nano-banana-edit-input-2.png',
        ],

        // num_images configuration
        num_images_type: 'integer',
        num_images_min: 1,
        num_images_max: 10,
        num_images_step: 1,
        num_images_default: 1, // Official default

        // seed configuration
        seed_type: 'integer',
        seed_info: 'The seed for the random number generator (optional)',

        // aspect_ratio configuration (auto is DEFAULT)
        aspect_ratio_type: 'enum',
        aspect_ratio_options: [
            'auto', // DEFAULT - preserves input aspect ratio
            '21:9',
            '16:9',
            '3:2',
            '4:3',
            '5:4',
            '1:1',
            '4:5',
            '3:4',
            '2:3',
            '9:16',
        ],
        aspect_ratio_default: 'auto', // Official default (different from t2i)
        aspect_ratio_info: 'Auto preserves input image aspect ratio',

        // output_format configuration
        output_format_type: 'enum',
        output_format_options: ['jpeg', 'png', 'webp'],
        output_format_default: 'png', // Official default

        // safety_tolerance configuration
        safety_tolerance_type: 'enum',
        safety_tolerance_options: ['1', '2', '3', '4', '5', '6'],
        safety_tolerance_default: '4', // Official default
        safety_tolerance_info: '1 is most strict, 6 is least strict',

        // sync_mode configuration
        sync_mode_type: 'boolean',
        sync_mode_default: false,
        sync_mode_info: 'If True, media returned as data URI',

        // limit_generations configuration
        limit_generations_type: 'boolean',
        limit_generations_default: false,
        limit_generations_info: 'Experimental: Forces single image per prompt',

        defaultValues: {
            prompt: '',
            image_urls: [], // Must be provided by user
            num_images: 1,
            seed: null,
            aspect_ratio: 'auto', // Preserve input aspect
            output_format: 'webp', // Override for web
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
            description: 'string (AI-generated description of edits)',
        },

        thumbnail: THUMBNAIL_BASE_URL + '/nano_banana_edit.png',
        description:
            'Gemini 2.5 Flash Image editing - Transform existing images with text prompts. Maintains character consistency across variations.',
        bestFor: [
            'character-variations',
            'mascot-poses',
            'style-modifications',
            'scene-changes',
        ],

        modelInfo: {
            backend: 'Gemini 2.5 Flash',
            provider: 'Google AI',
            mode: 'Image-to-Image',
            speed: 'Fast',
            preserves: 'Character identity, key features',
        },

        useCases: {
            memeCoins: [
                'Change mascot pose while keeping identity',
                'Modify background while preserving character',
                'Add/remove accessories on existing mascot',
                'Transform expressions without losing character',
                'Create animation frames with consistency',
            ],
        },
    },
    {
        modelNumber: 2,
        modelName: 'fal-ai/flux-2/edit',
        endpoint: 'fal-ai/flux-2/edit', // Official endpoint
        icon: 'Images/models-logo/flux.svg',
        credits: 5, // Estimate between dev (2) and nano-banana/edit (15)
        type: 'Premium',
        category: 'image-to-image',

        // All inputs from official schema
        inputs: [
            'prompt',
            'image_urls',
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

        required: ['prompt', 'image_urls'],

        // prompt configuration
        prompt_info:
            'The prompt to edit the image (natural language descriptions)',

        // image_urls configuration (CRITICAL - REQUIRED)
        image_urls_type: 'array<string>',
        image_urls_min: 1,
        image_urls_max: 4, // Official limit: max 4 images
        image_urls_info:
            'URLs of images for editing. Maximum 4 images allowed, only first 4 used if more provided',
        image_urls_formats: ['URL', 'Base64 data URI'],

        // guidance_scale configuration
        guidance_scale_type: 'float',
        guidance_scale_min: 0,
        guidance_scale_max: 20,
        guidance_scale_step: 0.1,
        guidance_scale_default: 2.5, // Official default
        guidance_scale_info: 'How closely to follow the prompt',

        // seed configuration
        seed_type: 'integer',
        seed_info: 'Random seed for reproducible results',

        // num_inference_steps configuration
        num_inference_steps_type: 'integer',
        num_inference_steps_min: 1,
        num_inference_steps_max: 50,
        num_inference_steps_step: 1,
        num_inference_steps_default: 28, // Official default

        // image_size configuration (supports both enum and custom)
        image_size_type: 'enum | object',
        image_size_options: [
            'square_hd', // 1024x1024
            'square', // 512x512
            'portrait_4_3', // 768x1024
            'portrait_16_9', // 576x1024
            'landscape_4_3', // 1024x768
            'landscape_16_9', // 1024x576
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
        image_size_info: 'Can use presets or custom dimensions (512-2048px)',

        // num_images configuration
        num_images_type: 'integer',
        num_images_min: 1,
        num_images_max: 10,
        num_images_step: 1,
        num_images_default: 1, // Official default

        // acceleration configuration
        acceleration_type: 'enum',
        acceleration_options: ['none', 'regular', 'high'],
        acceleration_default: 'regular', // Official default
        acceleration_info: 'Speed vs quality tradeoff',

        // enable_prompt_expansion configuration
        enable_prompt_expansion_type: 'boolean',
        enable_prompt_expansion_default: false,
        enable_prompt_expansion_info: 'Expand prompt for better results',

        // sync_mode configuration
        sync_mode_type: 'boolean',
        sync_mode_default: false,
        sync_mode_info: 'Return as data URI, not saved in history',

        // enable_safety_checker configuration
        enable_safety_checker_type: 'boolean',
        enable_safety_checker_default: true, // Official default

        // output_format configuration
        output_format_type: 'enum',
        output_format_options: ['jpeg', 'png', 'webp'],
        output_format_default: 'png', // Official default

        defaultValues: {
            prompt: '',
            image_urls: [], // Must be provided
            guidance_scale: 2.5,
            seed: null,
            num_inference_steps: 28,
            image_size: null, // Auto-detect from input
            num_images: 1,
            acceleration: 'regular',
            enable_prompt_expansion: false,
            sync_mode: false,
            enable_safety_checker: true,
            output_format: 'webp', // Override for web
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

        thumbnail: THUMBNAIL_BASE_URL + '/flux2_edit.png',
        description:
            'FLUX.2 [dev] Edit - Precise image modifications using natural language and hex color control. Superior quality editing with full FLUX parameters.',
        bestFor: [
            'precise-edits',
            'color-control',
            'detailed-modifications',
            'professional-editing',
        ],

        modelInfo: {
            backend: 'FLUX.2 [dev]',
            provider: 'Black Forest Labs',
            mode: 'Image-to-Image',
            quality: 'High',
            control: 'Maximum (full FLUX parameters)',
            streaming: true, // Supports streaming
        },

        uniqueFeatures: [
            'Hex color control for precise color edits',
            'Full FLUX.2 parameter control',
            'Supports streaming for real-time results',
            'Better quality than nano-banana/edit',
            'More customizable (guidance_scale, steps, etc.)',
        ],
    },
    {
        modelNumber: 3,
        modelName: 'fal-ai/nano-banana-pro/edit',
        endpoint: 'fal-ai/nano-banana-pro/edit',
        icon: 'Images/models-logo/nano_banana.svg',
        credits: 20, // Higher than base edit (15) due to PRO features
        type: 'Premium',
        category: 'image-to-image',

        // All inputs from official schema
        inputs: [
            'prompt',
            'image_urls',
            'num_images',
            'seed',
            'aspect_ratio',
            'output_format',
            'safety_tolerance',
            'sync_mode',
            'resolution', // PRO EXCLUSIVE
            'limit_generations',
            'enable_web_search', // PRO EXCLUSIVE
        ],

        required: ['prompt', 'image_urls'],

        // prompt configuration
        prompt_info: 'The prompt for image editing',

        // image_urls configuration (REQUIRED)
        image_urls_type: 'array<string>',
        image_urls_min: 1,
        image_urls_max: 10, // Can accept multiple
        image_urls_info: 'URLs of images for editing',

        // num_images configuration
        num_images_type: 'integer',
        num_images_min: 1,
        num_images_max: 10,
        num_images_step: 1,
        num_images_default: 1,

        // seed configuration
        seed_type: 'integer',
        seed_info: 'Random seed for reproducibility',

        // aspect_ratio configuration
        aspect_ratio_type: 'enum',
        aspect_ratio_options: [
            'auto', // Default - preserves input
            '21:9',
            '16:9',
            '3:2',
            '4:3',
            '5:4',
            '1:1',
            '4:5',
            '3:4',
            '2:3',
            '9:16',
        ],
        aspect_ratio_default: 'auto',
        aspect_ratio_info: 'Auto preserves input image aspect ratio',

        // output_format configuration
        output_format_type: 'enum',
        output_format_options: ['jpeg', 'png', 'webp'],
        output_format_default: 'png',

        // safety_tolerance configuration
        safety_tolerance_type: 'enum',
        safety_tolerance_options: ['1', '2', '3', '4', '5', '6'],
        safety_tolerance_default: '4',
        safety_tolerance_info: '1 is most strict, 6 is least strict',

        // sync_mode configuration
        sync_mode_type: 'boolean',
        sync_mode_default: false,

        // resolution configuration (PRO EXCLUSIVE)
        resolution_type: 'enum',
        resolution_options: ['1K', '2K', '4K'],
        resolution_default: '1K',
        resolution_info: 'PRO EXCLUSIVE: Control output resolution (1K/2K/4K)',
        resolution_note: 'Not available in base nano-banana/edit',

        // limit_generations configuration
        limit_generations_type: 'boolean',
        limit_generations_default: false,
        limit_generations_info: 'Experimental: Forces single image per prompt',

        // enable_web_search (PRO EXCLUSIVE)
        enable_web_search_type: 'boolean',
        enable_web_search_default: false,
        enable_web_search_info: 'PRO EXCLUSIVE: Use latest web info for edits',
        enable_web_search_note: 'Not available in base nano-banana/edit',

        defaultValues: {
            prompt: '',
            image_urls: [],
            num_images: 1,
            seed: null,
            aspect_ratio: 'auto',
            output_format: 'webp',
            safety_tolerance: '4',
            sync_mode: false,
            resolution: '2K', // Good balance
            limit_generations: false,
            enable_web_search: false,
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
            description: 'string (AI-generated description)',
        },

        thumbnail: `${THUMBNAIL_BASE_URL}/nano_banana_pro_edit.png`,
        description:
            'Gemini 3 Pro Edit - High-resolution character editing (up to 4K) with web search capabilities.',
        bestFor: [
            'high-res-edits',
            '4k-character-variations',
            'professional-mascot-edits',
        ],

        modelInfo: {
            backend: 'Gemini 3 Pro',
            provider: 'Google AI',
            mode: 'Image-to-Image',
            quality: 'Very High',
            maxResolution: '4K',
        },

        proFeatures: [
            'Resolution control (1K/2K/4K)',
            'Web search for current trends',
            'Higher quality than base edit',
            'Better for final production assets',
        ],
    },
    {
        modelNumber: 4,
        modelName: 'fal-ai/imageutils/rembg',
        endpoint: 'fal-ai/imageutils/rembg',
        icon: 'Images/models-logo/rembg.svg',
        credits: 2, // Cheap utility operation
        type: 'Standard',
        category: 'image-to-image', // Utility image transform

        // Inputs from official schema
        inputs: ['image_url', 'sync_mode', 'crop_to_bbox'],

        required: ['image_url'],

        // image_url configuration
        image_url_type: 'string',
        image_url_info:
            'Publicly accessible URL or data URI of the input image',
        image_url_formats: ['URL', 'Base64 data URI'],

        // sync_mode configuration
        sync_mode_type: 'boolean',
        sync_mode_default: false,
        sync_mode_info:
            'If true, returns media as data URI and won\'t be stored in history',

        // crop_to_bbox configuration
        crop_to_bbox_type: 'boolean',
        crop_to_bbox_default: false,
        crop_to_bbox_info:
            'If true, output is cropped to tight bounding box around subject',

        defaultValues: {
            image_url: '',
            sync_mode: false,
            crop_to_bbox: false,
        },

        // Output schema
        output: {
            image: {
                type: 'object',
                fields: {
                    url: 'string',
                    content_type: 'string',
                    file_name: 'string',
                    file_size: 'integer',
                    width: 'integer',
                    height: 'integer',
                    file_data: 'string | null',
                },
            },
        },

        thumbnail: `${THUMBNAIL_BASE_URL}/rembg.png`,
        description:
            'Background removal utility. Removes background from an image, optionally cropping to subject.',
        bestFor: ['background-removal', 'asset-prep', 'cutouts'],

        modelInfo: {
            backend: 'rembg',
            provider: 'fal.ai',
            mode: 'Image Utility',
            quality: 'High',
        },

        useCases: {
            memeCoins: [
                'Remove background from mascot images',
                'Prepare transparent assets for compositing',
                'Create clean cutouts for social media',
                'Extract characters for multi-layer designs',
                'Generate transparent PNGs for overlays',
            ],
        },
    },
];
