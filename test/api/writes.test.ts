/**
 * The write path (SPEC 9).
 *
 * The cases that matter are the ones where two things happen at once: a comment
 * arriving as the incident resolves, and two people claiming one session id.
 * Both are exercised against a real D1 database rather than a mocked store,
 * because both are decided by SQL, not by TypeScript.
 */
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { handleApiRequest } from "../../src/api/router.js";
import { diffIncident } from "../../src/reconcile/diff.js";
import { D1IssueStore } from "../../src/store/d1.js";
import { parseIncidentsResponse } from "../../src/statuspage/parse.js";
import type { TimelineEntry } from "../../src/shared/api.js";
import type { Incident } from "../../src/statuspage/schema.js";
import { snapshotAfter } from "../helpers/replay.js";
import incidentsFixture from "../fixtures/incidents.json";
import richIncidentFixture from "../fixtures/incident-actions-critical.json";

const PAGE = (incidentsFixture as { page: unknown }).page;
const RICH = parseIncidentsResponse({ page: PAGE, incidents: [richIncidentFixture] })
  .incidents[0]!;

let salt = 0;
function url(path: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `https://gitdown.chat${path}${separator}t=${salt}`;
}

async function call(path: string, init?: RequestInit, now?: number): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await handleApiRequest(new Request(url(path), init), env, ctx, now);
  await waitOnExecutionContext(ctx);
  return response;
}

interface CommentBody {
  sessionId?: string;
  token?: string;
  displayName?: string;
  body?: string;
}

function post(path: string, body: CommentBody, now?: number): Promise<Response> {
  return call(
    path,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
    now,
  );
}

function put(path: string, body: CommentBody, now?: number): Promise<Response> {
  return call(
    path,
    { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
    now,
  );
}

const ALICE = { sessionId: "11111111-1111-4111-8111-111111111111", token: "alice-secret" };

async function seed(incident: Incident): Promise<void> {
  await new D1IssueStore(env.DB).apply(diffIncident(incident, null));
}

/** The open issue every comment test posts into. */
async function seedOpenIssue(): Promise<number> {
  await seed(snapshotAfter(RICH, 1));
  const row = await env.DB.prepare("SELECT number FROM issues").first<{ number: number }>();
  return row!.number;
}

beforeEach(async () => {
  salt += 1;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM timeline"),
    env.DB.prepare("DELETE FROM issues"),
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM sync_state"),
    env.DB.prepare("DELETE FROM sqlite_sequence"),
  ]);
});

describe("POST /api/issues/:n/comments", () => {
  it("stores a comment and returns the created row", async () => {
    const number = await seedOpenIssue();

    const response = await post(`/api/issues/${number}/comments`, {
      ...ALICE,
      displayName: "alice",
      body: "this explains a lot",
    });
    const created = await response.json<{ entry: TimelineEntry }>();

    expect(response.status).toBe(201);
    expect(created.entry.kind).toBe("comment");
    expect(created.entry.body).toBe("this explains a lot");
    expect(created.entry.actor).toBe(ALICE.sessionId);
    // The author's name travels on the row, so rendering needs no second query.
    expect(created.entry.meta).toEqual({ name: "alice" });
    // A real seq, which is what the poll cursor is built on.
    expect(created.entry.seq).toBeGreaterThan(0);
  });

  it("stamps created_at at the edge, not from the client", async () => {
    const number = await seedOpenIssue();

    const response = await post(
      `/api/issues/${number}/comments`,
      { ...ALICE, displayName: "alice", body: "when did I say this", createdAt: 0 } as CommentBody,
      1_700_000_000_000,
    );
    const created = await response.json<{ entry: TimelineEntry }>();

    expect(created.entry.createdAt).toBe(1_700_000_000_000);
  });

  it("shows up in the timeline and bumps the denormalised count", async () => {
    const number = await seedOpenIssue();
    await post(`/api/issues/${number}/comments`, {
      ...ALICE,
      displayName: "alice",
      body: "same here",
    });

    const timeline = await call(`/api/issues/${number}/timeline?since=0`);
    const page = await timeline.json<{ events: TimelineEntry[] }>();
    expect(page.events.filter((e) => e.kind === "comment")).toHaveLength(1);

    const row = await env.DB.prepare("SELECT comment_count FROM issues WHERE number = ?1")
      .bind(number)
      .first<{ comment_count: number }>();
    expect(row!.comment_count).toBe(1);
  });

  it("is never cached", async () => {
    const number = await seedOpenIssue();
    const response = await post(`/api/issues/${number}/comments`, {
      ...ALICE,
      displayName: "alice",
      body: "hello",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("404s on an issue that does not exist", async () => {
    const response = await post("/api/issues/999/comments", {
      ...ALICE,
      displayName: "alice",
      body: "into the void",
    });
    expect(response.status).toBe(404);
  });

  describe("identity (SPEC 8)", () => {
    it("rejects a second visitor claiming an established session id", async () => {
      const number = await seedOpenIssue();
      await post(`/api/issues/${number}/comments`, {
        ...ALICE,
        displayName: "alice",
        body: "mine",
      });

      const impostor = await post(`/api/issues/${number}/comments`, {
        sessionId: ALICE.sessionId,
        token: "not-alices-token",
        displayName: "alice",
        body: "actually mine",
      });

      expect(impostor.status).toBe(403);
      const count = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM timeline WHERE kind = 'comment'",
      ).first<{ n: number }>();
      expect(count!.n).toBe(1);
    });

    it("keeps the established name when a later comment sends a different one", async () => {
      const number = await seedOpenIssue();
      await post(`/api/issues/${number}/comments`, {
        ...ALICE,
        displayName: "alice",
        body: "first",
      });

      const second = await post(`/api/issues/${number}/comments`, {
        ...ALICE,
        displayName: "someone-else",
        body: "second",
      });
      const created = await second.json<{ entry: TimelineEntry }>();

      expect(created.entry.meta).toEqual({ name: "alice" });
    });

    it.each(["github", "GitHub", "githubstatus", "github-status", "  github"])(
      "refuses the reserved name %j",
      async (displayName) => {
        const number = await seedOpenIssue();
        const response = await post(`/api/issues/${number}/comments`, {
          ...ALICE,
          displayName,
          body: "official announcement",
        });
        expect(response.status).toBe(400);
      },
    );

    it("never stores the raw token", async () => {
      const number = await seedOpenIssue();
      await post(`/api/issues/${number}/comments`, {
        ...ALICE,
        displayName: "alice",
        body: "hello",
      });

      const row = await env.DB.prepare("SELECT token_hash FROM sessions WHERE id = ?1")
        .bind(ALICE.sessionId)
        .first<{ token_hash: string }>();

      expect(row!.token_hash).not.toBe(ALICE.token);
      expect(row!.token_hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("validation", () => {
    it.each([
      ["an empty body", ""],
      ["whitespace only", "   \n  "],
      ["over the length cap", "x".repeat(4001)],
    ])("rejects %s", async (_label, body) => {
      const number = await seedOpenIssue();
      const response = await post(`/api/issues/${number}/comments`, {
        ...ALICE,
        displayName: "alice",
        body,
      });
      expect(response.status).toBe(400);
    });

    it("rejects a body that is not a JSON object", async () => {
      const number = await seedOpenIssue();
      const response = await call(`/api/issues/${number}/comments`, {
        method: "POST",
        body: "not json",
      });
      expect(response.status).toBe(400);
    });

    it("rejects a request missing the token", async () => {
      const number = await seedOpenIssue();
      const response = await post(`/api/issues/${number}/comments`, {
        sessionId: ALICE.sessionId,
        displayName: "alice",
        body: "no token",
      });
      expect(response.status).toBe(400);
    });
  });

  /**
   * SPEC 9.3. Traffic peaks exactly as the incident resolves, so there are
   * always comments in flight when the issue closes. Dropping one someone
   * watched themselves type is the worst failure available here.
   */
  describe("the close race", () => {
    async function seedClosedIssue(): Promise<{ number: number; resolvedAt: number }> {
      await seed(RICH);
      const row = await env.DB.prepare(
        "SELECT number, state, resolved_at FROM issues",
      ).first<{ number: number; state: string; resolved_at: number }>();
      expect(row!.state).toBe("closed");
      return { number: row!.number, resolvedAt: row!.resolved_at };
    }

    it("accepts a comment stamped before the issue closed", async () => {
      const { number, resolvedAt } = await seedClosedIssue();

      const response = await post(
        `/api/issues/${number}/comments`,
        { ...ALICE, displayName: "alice", body: "typed while it was still open" },
        resolvedAt - 1,
      );

      expect(response.status).toBe(201);
    });

    it("rejects a comment stamped after the issue closed", async () => {
      const { number, resolvedAt } = await seedClosedIssue();

      const response = await post(
        `/api/issues/${number}/comments`,
        { ...ALICE, displayName: "alice", body: "too late" },
        resolvedAt + 1,
      );

      expect(response.status).toBe(409);
    });

    it("leaves the comment count alone when the write is rejected", async () => {
      const { number, resolvedAt } = await seedClosedIssue();
      await post(
        `/api/issues/${number}/comments`,
        { ...ALICE, displayName: "alice", body: "too late" },
        resolvedAt + 1,
      );

      const row = await env.DB.prepare("SELECT comment_count FROM issues WHERE number = ?1")
        .bind(number)
        .first<{ comment_count: number }>();
      expect(row!.comment_count).toBe(0);
    });
  });
});

describe("PUT /api/session/name", () => {
  async function establishSession(): Promise<number> {
    const number = await seedOpenIssue();
    await post(`/api/issues/${number}/comments`, {
      ...ALICE,
      displayName: "alice",
      body: "hello",
    });
    return number;
  }

  it("renames a session that holds the token", async () => {
    await establishSession();

    const response = await put("/api/session/name", { ...ALICE, displayName: "alice-renamed" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ displayName: "alice-renamed" });
  });

  it("applies the new name to the next comment only", async () => {
    const number = await establishSession();
    await put("/api/session/name", { ...ALICE, displayName: "alice-renamed" });

    const response = await post(`/api/issues/${number}/comments`, {
      ...ALICE,
      displayName: "ignored",
      body: "after the rename",
    });
    const created = await response.json<{ entry: TimelineEntry }>();
    expect(created.entry.meta).toEqual({ name: "alice-renamed" });

    // The earlier comment keeps the name it was posted under: the feed is
    // append-only, and a viewer holding a cursor will never re-read that row.
    const first = await env.DB.prepare(
      "SELECT meta FROM timeline WHERE kind = 'comment' ORDER BY seq LIMIT 1",
    ).first<{ meta: string }>();
    expect(JSON.parse(first!.meta)).toEqual({ name: "alice" });
  });

  it("refuses a rename without the matching token", async () => {
    await establishSession();

    const response = await put("/api/session/name", {
      sessionId: ALICE.sessionId,
      token: "wrong",
      displayName: "hijacked",
    });
    expect(response.status).toBe(403);
  });

  it("refuses a reserved name", async () => {
    await establishSession();
    const response = await put("/api/session/name", { ...ALICE, displayName: "github" });
    expect(response.status).toBe(400);
  });

  it("404s for a session that has never posted", async () => {
    const response = await put("/api/session/name", {
      sessionId: "22222222-2222-4222-8222-222222222222",
      token: "nobody",
      displayName: "ghost",
    });
    expect(response.status).toBe(404);
  });
});

describe("method handling", () => {
  it("still rejects methods with no route", async () => {
    const response = await call("/api/issues", { method: "DELETE" });
    expect(response.status).toBe(405);
  });

  it("404s a POST to a read-only path", async () => {
    const response = await call("/api/issues", { method: "POST", body: "{}" });
    expect(response.status).toBe(404);
  });
});
