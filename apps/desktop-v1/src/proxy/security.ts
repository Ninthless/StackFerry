import { isIP } from "node:net";

export interface ListenPolicy {
  host: string;
  authenticationToken?: string;
  confirmedExternalAccess?: boolean;
}

export function validateListenPolicy(policy: ListenPolicy): void {
  if (isLoopback(policy.host)) {
    return;
  }
  if (!policy.confirmedExternalAccess) {
    throw new Error("Non-loopback proxy access requires explicit confirmation");
  }
  if (!policy.authenticationToken || policy.authenticationToken.length < 32) {
    throw new Error("Non-loopback proxy access requires a strong local token");
  }
}

function isLoopback(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  if (normalized === "localhost") {
    return true;
  }
  if (isIP(normalized) === 4) {
    return normalized.startsWith("127.");
  }
  return normalized === "::1" || normalized === "[::1]";
}
