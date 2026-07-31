import { describe, expect, it } from "vitest";
import { fetchSummary, fetchIncidents, StatuspageFetchError } from "../../src/statuspage/client.js";
import summaryFixture from "../fixtures/summary.json";
import incidentsFixture from "../fixtures/incidents.json";

interface Call {
  url: string;
  headers: Headers;
}

/** A fetch stub that records calls and replays a canned response. */
function stub(response: Response | (() => Response | Promise<Response>)) {
  const calls: Call[] = [];
  const fetchStub = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    return typeof response === "function" ? response() : response.clone();
  }) as typeof fetch;
  return { calls, fetch: fetchStub };
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

describe("statuspage client", () => {
  it("fetches and parses the summary endpoint", async () => {
    const { calls, fetch } = stub(json(summaryFixture));
    const feed = await fetchSummary({ fetch });

    expect(calls[0]!.url).toBe("https://www.githubstatus.com/api/v2/summary.json");
    expect(feed.page.name).toBe("GitHub");
    expect(feed.rejected).toEqual([]);
  });

  it("fetches and parses the incidents endpoint", async () => {
    const { calls, fetch } = stub(json(incidentsFixture));
    const feed = await fetchIncidents({ fetch });

    expect(calls[0]!.url).toBe("https://www.githubstatus.com/api/v2/incidents.json");
    expect(feed.incidents).toHaveLength(50);
  });

  it("identifies itself with a contactable User-Agent", async () => {
    const { calls, fetch } = stub(json(summaryFixture));
    await fetchSummary({ fetch });

    const ua = calls[0]!.headers.get("user-agent") ?? "";
    expect(ua).toContain("gitdown");
    expect(ua).toContain("gitdown.chat");
  });

  it("refuses to parse the body of a non-200 response", async () => {
    // Statuspage serves HTML on error; parsing it yields a far more confusing
    // failure than the status code does.
    const { fetch } = stub(new Response("<html>503</html>", { status: 503 }));
    await expect(fetchSummary({ fetch })).rejects.toMatchObject({
      name: "StatuspageFetchError",
      status: 503,
    });
  });

  it("reports a non-JSON 200 body distinctly from a transport failure", async () => {
    const { fetch } = stub(new Response("not json", { status: 200 }));
    await expect(fetchSummary({ fetch })).rejects.toThrow(/not JSON/);
  });

  it("wraps transport failures rather than leaking them raw", async () => {
    const { fetch } = stub(() => {
      throw new TypeError("network unreachable");
    });
    const error = await fetchSummary({ fetch }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StatuspageFetchError);
    expect((error as Error).message).toContain("network unreachable");
  });

  it("honours an overridden base URL", async () => {
    const { calls, fetch } = stub(json(summaryFixture));
    await fetchSummary({ fetch, baseUrl: "https://example.test" });
    expect(calls[0]!.url).toBe("https://example.test/api/v2/summary.json");
  });
});
