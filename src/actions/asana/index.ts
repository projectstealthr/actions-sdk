export {
  ASANA_API_BASE,
  type AsanaResource,
  type AsanaStory,
  type AsanaTask,
  asanaAuth,
  asanaGet,
  listProjects,
  listWorkspaces,
  projectOptions,
  projectProp,
  workspaceOptions,
  workspaceProp,
} from './common';
export {
  ADD_COMMENT_TYPE,
  addComment,
  CREATE_TASK_TYPE,
  createTask,
  GET_TASK_TYPE,
  getTask,
  LIST_TASKS_TYPE,
  listTasks,
  UPDATE_TASK_TYPE,
  updateTask,
} from './tasks';

import { addComment, createTask, getTask, listTasks, updateTask } from './tasks';

/** Every Asana action, for catalog builds and registration. */
export const asanaActions = [createTask, getTask, updateTask, listTasks, addComment] as const;
