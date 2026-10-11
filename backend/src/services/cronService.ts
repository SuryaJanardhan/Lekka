import cron from 'node-cron';
import { GmailService } from './gmailService';
import { runtimeConfig } from '../config/runtimeConfig';

export class CronService {
  public static initCronJobs() {
    const cronExpression = runtimeConfig.ingestionCronSchedule;

    console.log(`[Scheduler] Initializing daily ingestion job with cron pattern: ${cronExpression}`);

    cron.schedule(cronExpression, async () => {
      console.log('[Scheduler] Executing post-12 PM automated email ingestion pipeline...');
      try {
        const result = await GmailService.processIngestionPipeline();
        console.log(`[Scheduler] Ingestion completed. New: ${result.newIngested}, Duplicates: ${result.duplicatesSkipped}, Reviews: ${result.needsReviewCount}`);
      } catch (err) {
        console.error('[Scheduler] Ingestion cron job execution failed:', err);
      }
    });
  }
}
