export type WorkspacePanelId =
  | "global-agent"
  | "notes-library"
  | "calendar-ai"
  | "calendar-inspector"
  | "tasks-ai"
  | "tasks-inspector"
  | `note-ai:${string}`
  | `note-inspector:${string}`;

export type WorkspacePanelState = WorkspacePanelId | null;

export type WorkspacePanelAction =
  | { type: "open"; id: WorkspacePanelId }
  | { type: "close"; id?: WorkspacePanelId }
  | { type: "toggle"; id: WorkspacePanelId }
  | { type: "escape" }
  | { type: "route-change" };

export const initialWorkspacePanelState: WorkspacePanelState = null;

export function workspacePanelReducer(
  state: WorkspacePanelState,
  action: WorkspacePanelAction,
): WorkspacePanelState {
  switch (action.type) {
    case "open":
      return action.id;
    case "close":
      return !action.id || action.id === state ? null : state;
    case "toggle":
      return state === action.id ? null : action.id;
    case "escape":
    case "route-change":
      return null;
  }
}
