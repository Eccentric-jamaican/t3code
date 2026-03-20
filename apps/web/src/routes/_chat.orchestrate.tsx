import { createFileRoute } from "@tanstack/react-router";

import OrchestrateRouteView from "../components/orchestrate/OrchestrateRouteView";

type OrchestrateSearch = {
  projectId?: string;
  taskId?: string;
  view?: "board" | "list";
};

function parseOrchestrateSearch(search: Record<string, unknown>): OrchestrateSearch {
  const projectId =
    typeof search.projectId === "string" && search.projectId.trim().length > 0
      ? search.projectId
      : undefined;
  const taskId =
    typeof search.taskId === "string" && search.taskId.trim().length > 0 ? search.taskId : undefined;
  const view = search.view === "list" ? "list" : search.view === "board" ? "board" : undefined;
  return {
    ...(projectId ? { projectId } : {}),
    ...(taskId ? { taskId } : {}),
    ...(view ? { view } : {}),
  };
}

export const Route = createFileRoute("/_chat/orchestrate")({
  validateSearch: (search) => parseOrchestrateSearch(search),
  component: function OrchestrateRoute() {
    const search = Route.useSearch();
    return (
      <OrchestrateRouteView
        projectIdFromSearch={search.projectId}
        taskIdFromSearch={search.taskId}
        viewFromSearch={search.view}
      />
    );
  },
});
