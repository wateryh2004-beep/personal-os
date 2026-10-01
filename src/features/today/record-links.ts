/** Canonical workspace deep links keep Today cards tied to their source records. */
export const taskRecordHref = (id: string) => `/tasks?task=${encodeURIComponent(id)}`;
export const eventRecordHref = (id: string) => `/calendar?event=${encodeURIComponent(id)}`;
export const milestoneRecordHref = (id: string) => `/career/roadmap?milestone=${encodeURIComponent(id)}`;
