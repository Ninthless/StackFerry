import type { DesktopApi } from "../shared/contracts";

declare global {
  interface Window {
    stackferry: DesktopApi;
  }
}

export {};
