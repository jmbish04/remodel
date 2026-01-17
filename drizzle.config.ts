import type { Config } from 'drizzle-kit';

export default {
  schema: './worker/db/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  driver: 'd1-http',
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID || '27b4c738-e012-467c-96a3-378c8acaeb60',
    token: process.env.CLOUDFLARE_D1_TOKEN!,
  },
} satisfies Config;
