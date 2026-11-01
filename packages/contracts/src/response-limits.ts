/** Serialized UTF-8 JSON budgets shared by the server and browser transport. */
export const applicationResponseBytes = 1024 * 1024;
// Workspace contains up to 100 exact uses, each with <=256 KiB content plus
// bounded dependencies/use metadata, and one duplicated storyboard projection.
export const workspaceResponseBytes = 64 * applicationResponseBytes;
