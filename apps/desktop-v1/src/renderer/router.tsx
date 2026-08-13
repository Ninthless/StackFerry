import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { App } from "./App";

const rootRoute = createRootRoute({
  component: App,
});

const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
});

const overviewExplicitRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/overview",
});

const mcpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library/mcp",
});

const providersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library/providers",
});

const profilesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library/profiles",
});

const skillsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library/skills",
});

const promptsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library/prompts",
});

const systemRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/system",
});

const mcpDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library/mcp/$resourceId",
});

const agentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/agents/$agentId",
});

const routeTree = rootRoute.addChildren([
  overviewRoute,
  overviewExplicitRoute,
  mcpRoute,
  mcpDetailRoute,
  providersRoute,
  profilesRoute,
  skillsRoute,
  promptsRoute,
  systemRoute,
  agentRoute,
]);

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
