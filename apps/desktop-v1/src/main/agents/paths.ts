import path from "node:path";

export function homePath(...segments: string[]): string {
  const home =
    process.env.STACKFERRY_TEST_HOME ??
    process.env.USERPROFILE ??
    process.env.HOME;
  if (!home) {
    throw new Error("User home directory is unavailable");
  }
  return path.join(home, ...segments);
}
