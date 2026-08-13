export interface SseEvent {
  event: string | null;
  data: string;
  id: string | null;
}

export class SseParser {
  private buffer = "";

  push(chunk: string): SseEvent[] {
    this.buffer += chunk.replaceAll("\r\n", "\n");
    const events: SseEvent[] = [];
    let boundary = this.buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const block = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      const parsed = parseBlock(block);
      if (parsed) {
        events.push(parsed);
      }
      boundary = this.buffer.indexOf("\n\n");
    }
    return events;
  }

  finish(): SseEvent[] {
    const parsed = parseBlock(this.buffer);
    this.buffer = "";
    return parsed ? [parsed] : [];
  }
}

function parseBlock(block: string): SseEvent | null {
  if (!block.trim()) {
    return null;
  }
  let event: string | null = null;
  let id: string | null = null;
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith(":")) {
      continue;
    }
    const separator = line.indexOf(":");
    const field = separator >= 0 ? line.slice(0, separator) : line;
    const value =
      separator >= 0
        ? line.slice(separator + 1).replace(/^ /, "")
        : "";
    if (field === "event") {
      event = value;
    } else if (field === "data") {
      data.push(value);
    } else if (field === "id") {
      id = value;
    }
  }
  return { event, data: data.join("\n"), id };
}
