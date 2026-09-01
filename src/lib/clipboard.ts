import { settingsApi } from "@/platform/tauri/api";

export async function copyText(text: string): Promise<void> {
  try {
    await settingsApi.copyTextToClipboard(text);
    return;
  } catch (nativeError) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (webError) {
      throw webError instanceof Error
        ? webError
        : nativeError instanceof Error
          ? nativeError
          : new Error(String(webError || nativeError));
    }
  }
}
