import { z } from "zod";
/** Authorized Calendar mirror DTO, shared by both exact-identity read paths. */
export const calendarEventReadSchema = z.object({
  id: z.uuid(), provider_event_id: z.string().min(1), subject: z.string(), body_text: z.string().nullable(),
  starts_at: z.iso.datetime({ offset: true }), ends_at: z.iso.datetime({ offset: true }), is_all_day: z.boolean(),
  location_name: z.string().nullable(), categories: z.array(z.string()),
  importance: z.enum(["low", "normal", "high"]), show_as: z.enum(["free", "tentative", "busy", "oof", "workingElsewhere", "unknown"]), last_synced_at: z.iso.datetime({ offset: true }),
});
