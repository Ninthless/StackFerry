import type { PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AddSkillRepoResult,
  DiscoverAvailableResult,
  SkillRepo,
} from "@/platform/tauri/api/skills";
import { useAddSkillRepo, useDiscoverableSkills } from "./useSkills";

const { addRepoMock, discoverAvailableMock } = vi.hoisted(() => ({
  addRepoMock: vi.fn(),
  discoverAvailableMock: vi.fn(),
}));

vi.mock("@/platform/tauri/api/skills", async () => {
  const actual = await vi.importActual<
    typeof import("@/platform/tauri/api/skills")
  >("@/platform/tauri/api/skills");
  return {
    ...actual,
    skillsApi: {
      ...actual.skillsApi,
      addRepo: addRepoMock,
      discoverAvailable: discoverAvailableMock,
    },
  };
});

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("Skills queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("caches the complete discovery result", async () => {
    const result: DiscoverAvailableResult = {
      skills: [],
      failures: [
        {
          owner: "example",
          name: "broken",
          branch: "main",
          error: "network unavailable",
        },
      ],
    };
    discoverAvailableMock.mockResolvedValue(result);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result: hook } = renderHook(() => useDiscoverableSkills(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(hook.current.isSuccess).toBe(true));
    expect(hook.current.data).toEqual(result);
    expect(queryClient.getQueryData(["skills", "discoverable"])).toEqual(
      result,
    );
  });

  it("uses the backend repository result and refreshes discovery", async () => {
    const submitted: SkillRepo = {
      owner: "input-owner",
      name: "input-name",
      branch: "",
      enabled: true,
    };
    const response: AddSkillRepoResult = {
      repo: {
        owner: "actual-owner",
        name: "actual-name",
        branch: "main",
        enabled: true,
      },
      skillCount: 7,
    };
    addRepoMock.mockResolvedValue(response);
    const queryClient = new QueryClient();
    queryClient.setQueryData<SkillRepo[]>(["skills", "repos"], []);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result: hook } = renderHook(() => useAddSkillRepo(), {
      wrapper: createWrapper(queryClient),
    });

    let mutationResult: AddSkillRepoResult | undefined;
    await act(async () => {
      mutationResult = await hook.current.mutateAsync(submitted);
    });

    expect(addRepoMock.mock.calls[0]?.[0]).toEqual(submitted);
    expect(mutationResult).toEqual(response);
    expect(queryClient.getQueryData(["skills", "repos"])).toEqual([
      response.repo,
    ]);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["skills", "discoverable"],
    });
  });
});
