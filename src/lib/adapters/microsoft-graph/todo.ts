/**
 * Microsoft To Do adapter boundary. The first extraction keeps token and HTTP
 * transport in the established Graph module while all Tasks callers import
 * this domain entrypoint rather than the Calendar adapter.
 */
export {
  completeMicrosoftTodoTask,
  createMicrosoftTodoTask,
  deleteMicrosoftTodoTask,
  reopenMicrosoftTodoTask,
  syncMicrosoftTodo,
  updateMicrosoftTodoTask,
  type UpdateTodoTaskInput,
} from "./calendar";
