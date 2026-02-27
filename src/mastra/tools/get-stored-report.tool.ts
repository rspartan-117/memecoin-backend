/**
 * Get Stored Report Tool
 * Retrieves previously generated meme coin research reports
 */

import { PrismaService } from '../../shared/services/prisma.service';
import { Logger } from '@nestjs/common';

export interface GetStoredReportParams {
  coin_name: string;
  session_id?: string;
}

const logger = new Logger('GetStoredReportTool');

export const createGetStoredReportTool = (prisma: PrismaService) => ({
  id: 'get_stored_report',
  name: 'Get Stored Report',
  description:
    'Retrieve a previously saved meme coin research report from the database. ONLY use this for follow-up questions in sessions where research has ALREADY been completed. Do NOT use this for first-time research requests — call research_meme_coin directly instead.',

  parameters: {
    type: 'object',
    properties: {
      coin_name: {
        type: 'string',
        description: 'Name of the meme coin to retrieve report for',
      },
      session_id: {
        type: 'string',
        description:
          'Optional session ID to retrieve from specific conversation',
      },
    },
    required: ['coin_name'],
  },

  execute: async (params: GetStoredReportParams): Promise<string> => {
    try {
      logger.log(`Searching for cached report: ${params.coin_name}`);

      // Query database for most recent completed report
      const report = await prisma.memeReport.findFirst({
        where: {
          coinName: {
            equals: params.coin_name,
            mode: 'insensitive', // Case-insensitive search
          },
          sessionId: params.session_id, // Optional filter by session
          researchStatus: 'COMPLETED',
        },
        orderBy: {
          createdAt: 'desc', // Most recent first
        },
        select: {
          id: true,
          coinName: true,
          reportContent: true,
          summary: true,
          researchDurationSeconds: true,
          createdAt: true,
          sessionId: true,
        },
      });

      if (!report) {
        logger.log(`No cached report found for ${params.coin_name}`);
        return JSON.stringify(
          {
            success: false,
            coinName: params.coin_name,
            message:
              'No stored report found. Use research_meme_coin to generate a new one.',
          },
          null,
          2,
        );
      }

      // Calculate age of report
      const ageHours = Math.floor(
        (Date.now() - new Date(report.createdAt).getTime()) / (1000 * 60 * 60),
      );

      logger.log(
        `Found cached report for ${params.coin_name} (${ageHours}h old, ID: ${report.id})`,
      );

      // Return report data
      const result = {
        success: true,
        reportId: report.id,
        coinName: report.coinName,
        summary: report.summary,
        reportAge: `${ageHours} hours`,
        researchDuration: `${report.researchDurationSeconds}s`,
        createdAt: report.createdAt,
        fullReport: report.reportContent,
        note:
          ageHours > 24
            ? 'This report is over 24 hours old. Consider using refresh_coin_data for latest information.'
            : null,
      };

      return JSON.stringify(result, null, 2);
    } catch (error) {
      logger.error(
        `Failed to retrieve report for ${params.coin_name}:`,
        error.message,
      );
      return JSON.stringify(
        {
          success: false,
          coinName: params.coin_name,
          error: error.message,
        },
        null,
        2,
      );
    }
  },
});
