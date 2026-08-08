export type InboxCaptureState = {
  status: "idle" | "success" | "error";
  message: string;
  destinationHref?: string;
};

export const initialInboxCaptureState: InboxCaptureState = {
  status: "idle",
  message: "",
};
