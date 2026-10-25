import { requireOwner } from "@/lib/auth/require-owner";
export async function getTrips() {
  const { supabase, userId } = await requireOwner();
  const { data, error } = await supabase.from("trips").select("id,title,status,destination_label,description,start_date,end_date,budget_cny,created_at").eq("user_id", userId).is("archived_at", null).order("created_at", { ascending: false }).order("id");
  return { trips: data ?? [], unavailable: Boolean(error) };
}
export async function getTrip(tripId: string) {
  const { supabase, userId } = await requireOwner();
  const [trip, stops, links, documents] = await Promise.all([
    supabase.from("trips").select("id,title,status,destination_label,description,start_date,end_date,notes_markdown,mutation_revision,current_stop_id,next_stop_id").eq("id", tripId).eq("user_id", userId).is("archived_at", null).maybeSingle(),
    supabase.from("trip_stops").select("id,place_name,day_number,sort_order,latitude,longitude,notes,planned_time,duration_minutes,mutation_revision,arrived_at").eq("trip_id", tripId).eq("user_id", userId).order("day_number", { ascending: true, nullsFirst: false }).order("sort_order").order("id"),
    supabase.from("trip_documents").select("id,document_id").eq("trip_id", tripId).eq("user_id", userId).is("archived_at", null),
    supabase.from("documents").select("id,title,mime_type,storage_state").eq("user_id", userId).eq("storage_provider", "cloudflare_r2").eq("storage_state", "available").is("vault_group_id", null).is("archived_at", null).order("updated_at", { ascending: false }).limit(100),
  ]);
  const linkedIds = (links.data ?? []).map((link) => link.document_id);
  const linkedDocuments = linkedIds.length ? await supabase.from("documents").select("id,title,mime_type,storage_state").eq("user_id", userId).in("id", linkedIds).is("vault_group_id", null).is("archived_at", null) : { data: [], error: null };
  return { trip: trip.data, stops: stops.data ?? [], documents: linkedDocuments.data ?? [], availableDocuments: documents.data ?? [], unavailable: Boolean(trip.error || stops.error || links.error || documents.error || linkedDocuments.error) };
}
