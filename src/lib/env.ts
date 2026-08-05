export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ownerEmail: process.env.OWNER_EMAIL,
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
  calendarCompanionBridgeToken: process.env.CALENDAR_COMPANION_BRIDGE_TOKEN,
};

export const isSupabaseConfigured = Boolean(
  env.supabaseUrl && env.supabasePublishableKey,
);
