/**
 * Meme GPT Memory Store
 * Persistent conversation history using PostgreSQL
 */

import { PrismaService } from '../shared/services/prisma.service';
import { Logger } from '@nestjs/common';

export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  metadata?: Record<string, any>;
}

export class MemeGPTMemoryStore {
  private readonly logger = new Logger(MemeGPTMemoryStore.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Save a message to conversation history
   */
  async save(
    sessionId: string,
    role: string,
    content: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    try {
      await this.prisma.memeConversation.create({
        data: {
          sessionId,
          role,
          content,
          metadata: metadata || {},
        },
      });
      this.logger.debug(`Saved ${role} message to session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to save message:`, error.message);
      throw error;
    }
  }

  /**
   * Get conversation history for a session
   */
  async get(
    sessionId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<ConversationMessage[]> {
    try {
      const messages = await this.prisma.memeConversation.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
        skip: offset,
        take: limit,
        select: {
          role: true,
          content: true,
          metadata: true,
        },
      });

      return messages.map((msg) => ({
        role: msg.role as any,
        content: msg.content,
        metadata: msg.metadata as Record<string, any>,
      }));
    } catch (error) {
      this.logger.error(`Failed to retrieve history:`, error.message);
      throw error;
    }
  }

  /**
   * Get conversation history with pagination
   */
  async getHistory(sessionId: string, limit: number = 20): Promise<ConversationMessage[]> {
    return this.get(sessionId, limit, 0);
  }

  /**
   * Clear conversation history for a session
   */
  async clear(sessionId: string): Promise<void> {
    try {
      await this.prisma.memeConversation.deleteMany({
        where: { sessionId },
      });
      this.logger.log(`Cleared conversation history for session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to clear history:`, error.message);
      throw error;
    }
  }

  /**
   * Archive session (mark as ARCHIVED without deleting)
   */
  async archiveSession(sessionId: string): Promise<void> {
    try {
      await this.prisma.memeResearchSession.update({
        where: { id: sessionId },
        data: { status: 'ARCHIVED' },
      });
      this.logger.log(`Archived session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to archive session:`, error.message);
      throw error;
    }
  }

  /**
   * Get recent messages (last N messages)
   */
  async getRecentMessages(
    sessionId: string,
    count: number = 10,
  ): Promise<ConversationMessage[]> {
    try {
      const messages = await this.prisma.memeConversation.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'desc' },
        take: count,
        select: {
          role: true,
          content: true,
          metadata: true,
        },
      });

      // Reverse to chronological order
      return messages
        .reverse()
        .map((msg) => ({
          role: msg.role as any,
          content: msg.content,
          metadata: msg.metadata as Record<string, any>,
        }));
    } catch (error) {
      this.logger.error(`Failed to retrieve recent messages:`, error.message);
      throw error;
    }
  }

  /**
   * Count messages in a session
   */
  async countMessages(sessionId: string): Promise<number> {
    try {
      return await this.prisma.memeConversation.count({
        where: { sessionId },
      });
    } catch (error) {
      this.logger.error(`Failed to count messages:`, error.message);
      throw error;
    }
  }
}
