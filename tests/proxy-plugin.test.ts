import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { OpenClawError } from "../src/client/errors.js";
import type { StreamChunk } from "../src/client/types.js";

// ---------------------------------------------------------------------------
// Mock OpenClawClient
// ---------------------------------------------------------------------------

const mockClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn().mockReturnValue(true),
  stream: vi.fn(),
  on: vi.fn(),
};

vi.mock("../client/OpenClawClient.js", () => ({
  OpenClawClient: vi.fn().mockImplementation(() => mockClient),
}));

vi.mock("../core/global-config.js", () => ({
  readGlobalConfigWithDefaults: () => ({
    gatewayUrl: "ws://localhost:18789",
    token: "test-token",
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function* makeChunks(
  chunks: StreamChunk[],
): AsyncGenerator<StreamChunk, void, undefined> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

function parseSseEvents(body: string): Array<Record<string, unknown>> {
  return body
    .split("\n\n")
    .filter((block) => block.trim().startsWith("data:"))
    .map((block) => {
      const dataLine = block.trim().replace(/^data:\s*/, "");
      return JSON.parse(dataLine) as Record<string, unknown>;
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("proxyPlugin", () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient.isConnected.mockReturnValue(true);
    mockClient.connect.mockResolvedValue(undefined);
    mockClient.disconnect.mockResolvedValue(undefined);

    fastify = Fastify();
    const { proxyPlugin } = await import("../src/proxy/plugin.js");
    await fastify.register(proxyPlugin, { basePath: "/proxy" });
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  // -- Health ---------------------------------------------------------------

  describe("GET /proxy/health", () => {
    it("returns health status", async () => {
      const res = await fastify.inject({ method: "GET", url: "/proxy/health" });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("connected", true);
      expect(body).toHaveProperty("gatewayUrl", "ws://localhost:18789");
      expect(body).toHaveProperty("uptime");
      expect(typeof body.uptime).toBe("number");
    });
  });

  // -- Stream ---------------------------------------------------------------

  describe("GET /proxy/stream", () => {
    it("yields SSE chunk and done events", async () => {
      mockClient.stream.mockImplementation(() =>
        makeChunks([
          { content: "Hello", done: false },
          { content: " world", done: false },
          { content: "", done: true },
        ]),
      );

      const res = await fastify.inject({
        method: "GET",
        url: "/proxy/stream?prompt=hello",
      });

      expect(res.headers["content-type"]).toBe("text/event-stream");
      const events = parseSseEvents(res.body);
      const chunks = events.filter((e) => e.event === "chunk");
      const done = events.find((e) => e.event === "done");

      expect(chunks).toHaveLength(3);
      expect((chunks[0].data as Record<string, unknown>).content).toBe("Hello");
      expect((chunks[0].data as Record<string, unknown>).index).toBe(0);
      expect((chunks[1].data as Record<string, unknown>).content).toBe(" world");
      expect((chunks[1].data as Record<string, unknown>).index).toBe(1);
      expect(done).toBeDefined();
      expect((done!.data as Record<string, unknown>).totalChunks).toBe(3);
    });

    it("maps stream errors to SSE error events", async () => {
      mockClient.stream.mockImplementation(async function* () {
        throw new OpenClawError("STREAM_FAILED", "upstream error");
      });

      const res = await fastify.inject({
        method: "GET",
        url: "/proxy/stream?prompt=hello",
      });

      const events = parseSseEvents(res.body);
      const errorEvt = events.find((e) => e.event === "error");
      expect(errorEvt).toBeDefined();
      const data = errorEvt!.data as Record<string, unknown>;
      expect(data.code).toBe("STREAM_FAILED");
      expect(data.message).toBe("upstream error");
    });

    it("returns 400 when prompt is missing", async () => {
      const res = await fastify.inject({
        method: "GET",
        url: "/proxy/stream",
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 on invalid JSON in options", async () => {
      const res = await fastify.inject({
        method: "GET",
        url: "/proxy/stream?prompt=test&options={bad",
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // -- Concurrent streams ---------------------------------------------------

  describe("concurrent streams", () => {
    it("handles 3 parallel streams independently", async () => {
      let callCount = 0;
      mockClient.stream.mockImplementation(() => {
        const id = ++callCount;
        return makeChunks([
          { content: `response-${id}`, done: false },
          { content: "", done: true },
        ]);
      });

      const [r1, r2, r3] = await Promise.all([
        fastify.inject({ method: "GET", url: "/proxy/stream?prompt=a" }),
        fastify.inject({ method: "GET", url: "/proxy/stream?prompt=b" }),
        fastify.inject({ method: "GET", url: "/proxy/stream?prompt=c" }),
      ]);

      for (const res of [r1, r2, r3]) {
        const events = parseSseEvents(res.body);
        const chunks = events.filter((e) => e.event === "chunk");
        expect(chunks.length).toBeGreaterThanOrEqual(1);
        const done = events.find((e) => e.event === "done");
        expect(done).toBeDefined();
      }
    });
  });

  // -- Reconnect ------------------------------------------------------------

  describe("POST /proxy/reconnect", () => {
    it("calls disconnect then connect and returns success", async () => {
      const res = await fastify.inject({
        method: "POST",
        url: "/proxy/reconnect",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toEqual({ success: true, message: "Reconnected successfully" });
      expect(mockClient.disconnect).toHaveBeenCalledOnce();
      expect(mockClient.connect).toHaveBeenCalledOnce();
    });

    it("returns error on reconnect failure", async () => {
      mockClient.connect.mockRejectedValueOnce(new Error("connection refused"));

      const res = await fastify.inject({
        method: "POST",
        url: "/proxy/reconnect",
      });

      expect(res.statusCode).toBe(500);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.message).toContain("connection refused");
    });
  });
});
