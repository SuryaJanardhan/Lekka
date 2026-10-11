import 'dotenv/config';

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalCsv(name: string): string[] {
  return (process.env[name] || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export const runtimeConfig = {
  port: process.env.PORT || '5000',
  mongodbUri: requiredEnv('MONGODB_URI'),
  apiSecret: requiredEnv('LEKKA_API_SECRET'),
  corsOrigins: optionalCsv('CORS_ORIGINS'),
  ingestionCronSchedule: process.env.INGESTION_CRON_SCHEDULE || '0 12 * * *',
  targetSenderEmails: optionalCsv('TARGET_SENDER_EMAILS'),
  gmail: {
    user: process.env.GMAIL_USER?.trim() || '',
    appPassword: process.env.GMAIL_APP_PASSWORD?.trim() || '',
    clientId: process.env.GMAIL_CLIENT_ID?.trim() || '',
    clientSecret: process.env.GMAIL_CLIENT_SECRET?.trim() || '',
    redirectUri: process.env.GMAIL_REDIRECT_URI?.trim() || 'https://developers.google.com/oauthplayground',
    refreshToken: process.env.GMAIL_REFRESH_TOKEN?.trim() || ''
  }
};

export function assertIngestionConfigured() {
  if (runtimeConfig.targetSenderEmails.length === 0) {
    throw new Error('TARGET_SENDER_EMAILS must contain at least one selected sender.');
  }

  const hasImap = Boolean(runtimeConfig.gmail.user && runtimeConfig.gmail.appPassword);
  const hasOAuth = Boolean(
    runtimeConfig.gmail.clientId &&
      runtimeConfig.gmail.clientSecret &&
      runtimeConfig.gmail.refreshToken
  );

  if (!hasImap && !hasOAuth) {
    throw new Error('Configure Gmail IMAP credentials or Gmail OAuth credentials before running ingestion.');
  }
}
