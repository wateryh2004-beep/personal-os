export const tripStatuses = ["dream", "shortlist", "planning", "booked", "completed", "archived"] as const;
export type TripStatus = (typeof tripStatuses)[number];
export type TripStop = { id: string; placeName: string; dayNumber: number | null; sortOrder: number; latitude: number | null; longitude: number | null };
