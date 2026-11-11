import { it, expect, vi } from "vitest";
import https from "node:https";
import { lookup } from "node:dns/promises";
import { EventEmitter } from "node:events";
import { fetchPublicPage } from "../server/website";
vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
it("rejects mixed public/private DNS answers before opening a connection", async () => {
  vi.mocked(lookup).mockResolvedValue([
    { address: "93.184.216.34", family: 4 },
    { address: "127.0.0.1", family: 4 },
  ] as never);
  const socket = vi.spyOn(https, "request");
  try {
    await expect(
      fetchPublicPage(new URL("https://fictional.example/")),
    ).rejects.toThrow("blocked");
    expect(socket).not.toHaveBeenCalled();
  } finally {
    socket.mockRestore();
  }
});
it("pins the socket to the checked DNS answer and sends no credentials or cookies", async () => {
  vi.mocked(lookup).mockResolvedValue([
    { address: "93.184.216.34", family: 4 },
  ] as never);
  let settings: https.RequestOptions | undefined;
  const request = vi.spyOn(https, "request").mockImplementation(((
    url: URL,
    options: https.RequestOptions,
    callback: (response: unknown) => void,
  ) => {
    settings = options;
    const req = new EventEmitter() as EventEmitter & {
      end: () => void;
      destroy: () => void;
    };
    req.destroy = () => {
      req.emit("close");
    };
    req.end = () => {
      const response = new EventEmitter() as EventEmitter & {
        statusCode: number;
        headers: object;
      };
      response.statusCode = 200;
      response.headers = { "content-type": "text/html" };
      callback(response);
      response.emit("data", Buffer.from("<p>Public page</p>"));
      response.emit("end");
      req.emit("close");
    };
    return req;
  }) as typeof https.request);
  try {
    await fetchPublicPage(new URL("https://fictional.example/"));
    expect(settings?.agent).toBe(false);
    expect(settings?.servername).toBe("fictional.example");
    expect(settings?.headers).not.toHaveProperty("Authorization");
    expect(settings?.headers).not.toHaveProperty("Cookie");
    expect(settings?.headers).not.toHaveProperty("apikey");
    const callback = vi.fn();
    (settings!.lookup as Function)("fictional.example", {}, callback);
    expect(callback).toHaveBeenCalledWith(null, "93.184.216.34", 4);
  } finally {
    request.mockRestore();
  }
});
