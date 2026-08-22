export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ownerEmail: process.env.OWNER_EMAIL,
  ownerUserId: process.env.OWNER_USER_ID,
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
  cronSecret: process.env.CRON_SECRET,
  appUrl: process.env.APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined),
};

export const isSupabaseConfigured = Boolean(
  env.supabaseUrl && env.supabasePublishableKey,
);
