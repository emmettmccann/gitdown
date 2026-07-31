import { describe, expect, it } from "vitest";
import { parseSummary, parseIncidentsResponse, StatuspageParseError } from "../../src/statuspage/parse.js";
import { isRealComponent } from "../../src/statuspage/schema.js";
import summaryFixture from "../fixtures/summary.json";
import incidentsFixture from "../fixtures/incidents.json";
import richIncidentFixture from "../fixtures/incident-actions-critical.json";

/** An incidents.json envelope wrapping a single incident, for focused cases. */
function envelope(incident: unknown) {
  return { page: (incidentsFixture as { page: unknown }).page, incidents: [incident] };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("parsing real githubstatus.com payloads", () => {
  it("accepts the live summary payload", () => {
    const feed = parseSummary(summaryFixture);
    expect(feed.rejected).toEqual([]);
    expect(feed.page.name).toBe("GitHub");
    expect(feed.components.length).toBeGreaterThan(0);
  });

  it("accepts all 50 incidents in the recorded history", () => {
    const feed = parseIncidentsResponse(incidentsFixture);
    expect(feed.rejected).toEqual([]);
    expect(feed.incidents).toHaveLength(50);
  });

  it("converts ISO-8601 timestamps to epoch milliseconds", () => {
    const feed = parseIncidentsResponse(envelope(richIncidentFixture));
    const incident = feed.incidents[0]!;
    expect(incident.created_at).toBe(Date.parse("2026-07-19T23:34:03.457Z"));
    expect(incident.resolved_at).toBe(Date.parse("2026-07-20T04:44:03.085Z"));
  });

  it("defaults absent optional timestamps to null rather than NaN", () => {
    const raw = clone(richIncidentFixture) as Record<string, unknown>;
    raw["monitoring_at"] = null;
    raw["resolved_at"] = null;
    const incident = parseIncidentsResponse(envelope(raw)).incidents[0]!;
    expect(incident.monitoring_at).toBeNull();
    expect(incident.resolved_at).toBeNull();
  });
});

describe("normalisation", () => {
  it("reorders incident_updates oldest-first", () => {
    // Statuspage serves these newest-first; the timeline reads as a story, so
    // getting this backwards would render every incident in reverse.
    const raw = richIncidentFixture as { incident_updates: { status: string }[] };
    expect(raw.incident_updates[0]!.status).toBe("resolved");

    const incident = parseIncidentsResponse(envelope(richIncidentFixture)).incidents[0]!;
    expect(incident.incident_updates[0]!.status).toBe("investigating");
    expect(incident.incident_updates.at(-1)!.status).toBe("resolved");

    const times = incident.incident_updates.map((u) => u.created_at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("keeps every update when reordering", () => {
    const incident = parseIncidentsResponse(envelope(richIncidentFixture)).incidents[0]!;
    expect(incident.incident_updates).toHaveLength(18);
  });

  it("drops the status-page banner masquerading as a component", () => {
    const feed = parseSummary(summaryFixture);
    const names = feed.components.map((c) => c.name);
    expect(names).not.toContain("Visit www.githubstatus.com for more information");
    expect(names).toContain("Actions");
  });

  it("treats the sentinel id as unreal regardless of its name", () => {
    expect(
      isRealComponent({
        id: "0l2p9nhqnxpd",
        name: "Anything At All",
        status: "operational",
        position: 3,
        description: null,
        group: false,
        group_id: null,
      }),
    ).toBe(false);
  });
});

describe("component transitions", () => {
  it("reads transitions from incident updates, not the live component records", () => {
    const feed = parseIncidentsResponse(envelope(richIncidentFixture));
    const incident = feed.incidents[0]!;

    // The attached component records report current live state, which for a
    // long-resolved incident is 'operational' — using them for transitions
    // would produce a timeline claiming nothing ever broke.
    expect(incident.components.every((c) => c.status === "operational")).toBe(true);

    const transitions = incident.incident_updates.flatMap((u) => u.affected_components ?? []);
    expect(transitions.length).toBeGreaterThan(0);
    expect(transitions[0]).toMatchObject({
      name: "Actions",
      old_status: "operational",
      new_status: "degraded_performance",
    });
  });

  it("tolerates updates with no affected_components", () => {
    const raw = clone(richIncidentFixture) as { incident_updates: Record<string, unknown>[] };
    delete raw.incident_updates[0]!["affected_components"];
    raw.incident_updates[1]!["affected_components"] = null;

    const incident = parseIncidentsResponse(envelope(raw)).incidents[0]!;
    expect(incident.incident_updates.every((u) => u.affected_components !== undefined)).toBe(true);
  });
});

describe("resilience to upstream change", () => {
  it("rejects one unknown enum value without losing the other incidents", () => {
    const bad = clone(richIncidentFixture) as Record<string, unknown>;
    bad["id"] = "broken-incident";
    bad["status"] = "vibing"; // a status Statuspage does not define

    const good = clone(richIncidentFixture);
    const feed = parseIncidentsResponse({
      page: (incidentsFixture as { page: unknown }).page,
      incidents: [bad, good],
    });

    expect(feed.incidents).toHaveLength(1);
    expect(feed.incidents[0]!.id).toBe("8vfyvq16hzh9");
    expect(feed.rejected).toHaveLength(1);
    expect(feed.rejected[0]!.id).toBe("broken-incident");
    expect(feed.rejected[0]!.error).toContain("status");
  });

  it("accepts statuses that are legal but absent from recent history", () => {
    // `identified` and `postmortem` appear in no recent githubstatus.com
    // incident. Inferring the enum from observed data would mean discovering
    // that during an outage.
    for (const status of ["identified", "postmortem"]) {
      const raw = clone(richIncidentFixture) as Record<string, unknown>;
      raw["status"] = status;
      const feed = parseIncidentsResponse(envelope(raw));
      expect(feed.rejected).toEqual([]);
      expect(feed.incidents[0]!.status).toBe(status);
    }
  });

  it("ignores unrecognised extra fields", () => {
    const raw = clone(richIncidentFixture) as Record<string, unknown>;
    raw["some_new_field"] = { nested: true };
    expect(parseIncidentsResponse(envelope(raw)).rejected).toEqual([]);
  });

  it("reports a null id when the payload is too broken to identify", () => {
    const feed = parseIncidentsResponse(envelope({ not: "an incident" }));
    expect(feed.rejected).toEqual([{ id: null, error: expect.any(String) }]);
  });

  it("throws when the page envelope itself is unusable", () => {
    expect(() => parseSummary({ incidents: [] })).toThrow(StatuspageParseError);
    expect(() => parseSummary("nope")).toThrow(StatuspageParseError);
  });

  it("survives a missing incidents key", () => {
    const feed = parseSummary({ page: (summaryFixture as { page: unknown }).page });
    expect(feed.incidents).toEqual([]);
    expect(feed.rejected).toEqual([]);
  });
});
