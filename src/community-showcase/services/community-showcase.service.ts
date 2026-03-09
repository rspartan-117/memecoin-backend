import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../shared/services/prisma.service';
import { S3UrlService } from '../../shared/services/s3-url.service';
import { CacheService } from '../../shared/services/redis-cache.service';
import {
  CommunityShowcaseResponseDto,
  DeployedAppDto,
} from '../dtos/community-showcase.dto';

@Injectable()
export class CommunityShowcaseService {
  private readonly logger = new Logger(CommunityShowcaseService.name);
  private readonly pagespeedApiKey: string;
  private readonly pagespeedApiUrl =
    'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

  private readonly CACHE_KEY_PREFIX = 'community-showcase:apps';
  private readonly CACHE_DURATION_HOURS = 24;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly s3Service: S3UrlService,
    private readonly cacheService: CacheService,
  ) {
    this.pagespeedApiKey =
      this.configService.get<string>('GOOGLE_PAGESPEED_API_KEY') || '';
  }

  /**
   * Returns all publicly deployed apps (visibility = 'pb', status = 'ACTIVE').
   * Results are cached in Redis for 24 hours.
   *
   * @param category - Optional filter: only 'landingpage' is supported (all deployments in this project are landing pages)
   */
  async getAllDeployedApps(
    category?: 'landingpage',
  ): Promise<CommunityShowcaseResponseDto> {
    this.logger.log(
      '╔════════════════════════════════════════════════════════════╗',
    );
    this.logger.log(
      '║     COMMUNITY SHOWCASE: Starting Request                  ║',
    );
    this.logger.log(
      '╚════════════════════════════════════════════════════════════╝',
    );

    // Normalize category
    const normalizedCategory = category
      ? this.normalizeCategory(category)
      : undefined;
    this.logger.log(`Requested category: ${normalizedCategory || 'all'}`);

    // Check cache first
    const cacheKey = normalizedCategory
      ? `${this.CACHE_KEY_PREFIX}:${normalizedCategory}`
      : this.CACHE_KEY_PREFIX;

    try {
      const cached = await this.cacheService.getFromCache(cacheKey);
      if (cached) {
        this.logger.log(`Cache HIT for key: ${cacheKey}`);
        return cached as CommunityShowcaseResponseDto;
      }
      this.logger.log(`Cache MISS for key: ${cacheKey}`);
    } catch (cacheError) {
      this.logger.warn(
        `Cache read failed (proceeding without cache): ${cacheError.message}`,
      );
    }

    try {
      const freshData = await this.fetchShowcaseData(normalizedCategory);

      // Store in cache
      try {
        await this.cacheService.addToCacheWithCustomTime(
          cacheKey,
          freshData,
          this.CACHE_DURATION_HOURS,
        );
        this.logger.log(`Cached result under key: ${cacheKey}`);
      } catch (cacheError) {
        this.logger.warn(`Cache write failed: ${cacheError.message}`);
      }

      this.logger.log(
        `Request completed — returning ${freshData.apps.length} apps`,
      );
      return freshData;
    } catch (error) {
      this.logger.error(`Failed to fetch showcase data: ${error.message}`);
      this.logger.error(error.stack);
      throw new InternalServerErrorException(
        `Failed to fetch deployed apps: ${error.message}`,
      );
    }
  }

  /**
   * Fetches public deployments from the database, optionally filtered by category.
   */
  private async fetchShowcaseData(
    category?: 'landingpage',
  ): Promise<CommunityShowcaseResponseDto> {
    this.logger.log('STEP 1: Querying public deployments from database...');

    const deployments = await this.prisma.deployment.findMany({
      where: {
        visibility: 'pb',
        status: 'ACTIVE',
      },
      orderBy: {
        deployedAt: 'desc',
      },
      select: {
        id: true,
        projectId: true,
        frontendAppName: true,
        frontendUrl: true,
        screenshotUrl: true,
        customDomain: true,
        projectType: true,
        status: true,
        deployedAt: true,
        createdAt: true,
        updatedAt: true,
        project: {
          select: {
            name: true,
          },
        },
        user: {
          select: {
            username: true,
          },
        },
      },
    });

    this.logger.log(`Found ${deployments.length} public active deployments`);

    if (deployments.length === 0) {
      return { apps: [], total: 0 };
    }

    // STEP 2: Detect categories and filter if needed
    this.logger.log('STEP 2: Detecting categories from app names...');

    let filteredDeployments = deployments;

    if (category) {
      filteredDeployments = deployments.filter((d) => {
        const detectedCategory = this.detectCategoryFromAppName(
          d.frontendAppName || '',
        );
        return detectedCategory === category;
      });
      this.logger.log(
        `After category filter "${category}": ${filteredDeployments.length} deployments`,
      );
    }

    // STEP 3: Capture missing screenshots
    this.logger.log('STEP 3: Checking for missing screenshots...');

    let screenshotsCaptured = 0;
    for (const deployment of filteredDeployments) {
      if (!deployment.screenshotUrl && deployment.frontendUrl) {
        this.logger.log(
          `Capturing missing screenshot for deployment ${deployment.id}`,
        );
        const screenshotUrl = await this.captureAndStoreScreenshot(
          deployment.frontendUrl,
          deployment.projectId,
          deployment.frontendAppName || `deployment-${deployment.id}`,
        );

        if (screenshotUrl) {
          deployment.screenshotUrl = screenshotUrl;
          screenshotsCaptured++;

          // Persist screenshot URL to DB so we don't re-capture next time
          await this.prisma.deployment.update({
            where: { id: deployment.id },
            data: { screenshotUrl },
          });
        }
      }
    }

    if (screenshotsCaptured > 0) {
      this.logger.log(`Captured ${screenshotsCaptured} new screenshot(s)`);
    }

    // STEP 4: Build response
    this.logger.log('STEP 4: Building response...');

    const apps: DeployedAppDto[] = filteredDeployments.map((d) => {
      const domains: string[] = [];
      // Only include custom domain in the public showcase response (not the Koyeb URL)
      if (d.customDomain) {
        const customUrl = d.customDomain.startsWith('http')
          ? d.customDomain
          : `https://${d.customDomain}`;
        domains.push(customUrl);
      } else if (d.frontendUrl) {
        // Fallback to Koyeb URL only if no custom domain exists
        domains.push(d.frontendUrl);
      }

      return {
        id: d.id,
        name: d.frontendAppName || `deployment-${d.id}`,
        status: d.status,
        domains,
        screenshotUrl: d.screenshotUrl || undefined,
        createdAt: (d.deployedAt || d.createdAt).toISOString(),
        updatedAt: d.updatedAt.toISOString(),
        category: this.detectCategoryFromAppName(d.frontendAppName || ''),
        projectName: d.project?.name || undefined,
        username: d.user?.username || undefined,
      };
    });

    this.logger.log(`Returning ${apps.length} apps in showcase response`);

    return {
      apps,
      total: apps.length,
    };
  }

  /**
   * Normalize category input to handle typos and common variations.
   * Only 'landingpage' is valid in this project — all deployments use type code 'lp'.
   */
  private normalizeCategory(category: string): 'landingpage' | undefined {
    const normalized = category.toLowerCase().trim();

    if (
      normalized === 'landingpage' ||
      normalized === 'landing-page' ||
      normalized === 'landing_page' ||
      normalized === 'lp'
    ) {
      return 'landingpage';
    }

    return undefined;
  }

  /**
   * Detect category from the deploy app name convention:
   * `{name}-fr-{typeCode}-{visibility}-{timestamp}`
   *
   * In this project, projectTypeCode is always 'lp' (landing page),
   * so this will always return 'landingpage' for valid deployment names.
   */
  private detectCategoryFromAppName(appName: string): string | undefined {
    const lower = appName.toLowerCase();

    if (lower.includes('-lp-')) return 'landingpage';

    return undefined;
  }

  /**
   * Capture a screenshot via Google PageSpeed Insights API and upload to S3.
   * Mirrors the same approach used in DeployService.
   */
  private async captureAndStoreScreenshot(
    url: string,
    projectId: string,
    appName: string,
    retries = 3,
  ): Promise<string | undefined> {
    if (!this.pagespeedApiKey) {
      this.logger.debug(
        'Skipping screenshot — GOOGLE_PAGESPEED_API_KEY is not set',
      );
      return undefined;
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        this.logger.debug(
          `Screenshot capture attempt ${attempt}/${retries} for: ${url}`,
        );

        const pagespeedUrl = `${this.pagespeedApiUrl}?url=${encodeURIComponent(url)}&key=${this.pagespeedApiKey}&strategy=desktop`;

        const response = await fetch(pagespeedUrl);

        if (response.status === 403) {
          this.logger.error(
            'PageSpeed API 403 — API key may be invalid or rate limited',
          );
          return undefined;
        }

        if (response.status === 429) {
          this.logger.warn(
            'PageSpeed API rate limit hit (429), waiting before retry...',
          );
          await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
          continue;
        }

        if (!response.ok) {
          this.logger.warn(
            `PageSpeed API failed for ${url}: ${response.status}`,
          );
          if (attempt < retries) {
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
            continue;
          }
          return undefined;
        }

        const data = await response.json();
        const screenshotData =
          data?.lighthouseResult?.audits?.['final-screenshot']?.details?.data;

        if (!screenshotData) {
          this.logger.warn(`No screenshot data available for ${url}`);
          return undefined;
        }

        const base64Data = screenshotData.replace(
          /^data:image\/[a-z]+;base64,/,
          '',
        );
        const fileKey = `community-showcase/screenshots/${projectId}-${Date.now()}.jpg`;

        await this.s3Service.uploadFromBase64(
          fileKey,
          base64Data,
          'image/jpeg',
          `${appName}-screenshot.jpg`,
        );

        const publicUrl = this.s3Service.getPublicUrl(fileKey);
        this.logger.log(`Screenshot captured and stored: ${publicUrl}`);

        return publicUrl;
      } catch (error) {
        this.logger.error(
          `Screenshot capture error (attempt ${attempt}/${retries}): ${error?.message || error}`,
        );
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    this.logger.error(`Failed to capture screenshot after ${retries} attempts`);
    return undefined;
  }

  /**
   * Invalidate cached showcase data. Call when a new public deployment
   * is created or an existing deployment's visibility changes.
   */
  async invalidateCache(category?: 'landingpage'): Promise<void> {
    this.logger.log('Cache invalidation requested');

    if (category) {
      const cacheKey = `${this.CACHE_KEY_PREFIX}:${category}`;
      await this.cacheService.deleteFromCache(cacheKey);
      this.logger.log(`Cache invalidated for category: ${category}`);
      return;
    }

    // Invalidate both the global key and the landingpage-specific key
    await this.cacheService.deleteFromCache(this.CACHE_KEY_PREFIX);
    await this.cacheService.deleteFromCache(
      `${this.CACHE_KEY_PREFIX}:landingpage`,
    );
    this.logger.log('All showcase caches invalidated');
  }
}
