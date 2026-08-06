export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ownerEmail: process.env.OWNER_EMAIL,
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
  cronSecret: process.env.CRON_SECRET,
};

export const isSupabaseConfigured = Boolean(
  env.supabaseUrl && env.supabasePublishableKey,
);
