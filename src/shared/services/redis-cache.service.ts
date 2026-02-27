import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { Cache } from 'cache-manager';

@Injectable()
export class CacheService {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async addToCache(key: string, item: any) {
    const ttl = 3 * 60 * 60 * 1000; // TTL of 3 hours
    await this.cache.set(key, JSON.stringify(item), ttl);
  }

  async addToCacheWithCustomTime(key: string, item: any, hours: number) {
    const ttl = hours * 60 * 60 * 1000;
    await this.cache.set(key, JSON.stringify(item), ttl);
  }

  async getFromCache(key: string): Promise<any | null> {
    const cachedValue = await this.cache.get<string>(key);
    return cachedValue ? JSON.parse(cachedValue) : null;
  }

  async deleteFromCache(key: string): Promise<boolean> {
    const cachedValue = await this.cache.del(key);
    return cachedValue;
  }
}
