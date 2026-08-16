export type InboxCaptureState = {
  status: "idle" | "success" | "error";
  message: string;
  destinationHref?: string;
  /** 写入成功后返回的新 Inbox id。 */
  inboxId?: string;
  /** 写入时是否已完成自动识别。 */
  classified?: boolean;
};

export const initialInboxCaptureState: InboxCaptureState = {
  status: "idle",
  message: "",
};

export type InboxClassifyState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialInboxClassifyState: InboxClassifyState = {
  status: "idle",
  message: "",
};
