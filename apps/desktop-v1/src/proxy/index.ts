import { ProxyEngine } from "./engine";
import { proxyEventSchema, proxyRequestSchema } from "../shared/proxy";

const parentPort = process.parentPort;

if (!parentPort) {
  throw new Error("Proxy process requires a parent port");
}

const engine = new ProxyEngine();

parentPort.once("message", (event) => {
  const port = event.ports[0];
  if (!port) {
    throw new Error("Proxy process message port is unavailable");
  }
  port.on("message", async ({ data }: { data: unknown }) => {
    const request = proxyRequestSchema.parse(data);
    if (request.method === "execute") {
      await engine.execute(request, (event) =>
        port.postMessage(proxyEventSchema.parse(event)),
      );
    } else if (request.method === "cancel" && request.targetId) {
      engine.cancel(request.targetId);
    } else if (request.method === "shutdown") {
      engine.shutdown();
    }
  });
  port.start();
});

process.once("exit", () => engine.shutdown());
