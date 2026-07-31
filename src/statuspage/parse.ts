/**
 * Validation and normalisation of Statuspage payloads.
 *
 * Resilience posture: incidents are validated *individually*, and one that fails
 * is dropped and reported rather than aborting the whole poll. If GitHub adds an
 * incident status or component state we do not know about, the site should keep
 * ingesting every incident it does understand — the alternative is ingestion
 * stopping entirely at exactly the moment the site matters most. "Fail loudly"
 * means report loudly, not stop the world.
 *
 * The page envelope is different: if that fails to parse we have nothing
 * trustworthy to act on, so it throws.
 */
import { z } from "zod";
import {
  Incident,
  IncidentComponent,
  Page,
  isRealComponent,
  type Incident as IncidentType,
  type IncidentComponent as IncidentComponentType,
  type Page as PageType,
} from "./schema.js";

export interface RejectedIncident {
  /** Best-effort id; null when the payload was too malformed to read one. */
  id: string | null;
  error: string;
}

export interface ParsedFeed {
  page: PageType;
  components: IncidentComponentType[];
  incidents: IncidentType[];
  rejected: RejectedIncident[];
}

export class StatuspageParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatuspageParseError";
  }
}

function describe(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
    .join("; ");
}

/** Best-effort id extraction from a payload that failed validation. */
function idOf(raw: unknown): string | null {
  if (typeof raw === "object" && raw !== null && "id" in raw) {
    const id = (raw as { id: unknown }).id;
    if (typeof id === "string") return id;
  }
  return null;
}

/**
 * Put an incident into the shape the rest of the system expects.
 *
 * Statuspage returns `incident_updates` newest-first. Every consumer here wants
 * oldest-first — the timeline is append-only and reads as a story — so the sort
 * happens once, at the boundary, rather than being re-remembered at each use.
 */
function normalize(incident: IncidentType): IncidentType {
  return {
    ...incident,
    incident_updates: [...incident.incident_updates].sort(
      (a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id),
    ),
    components: incident.components.filter(isRealComponent),
  };
}

function parseIncidents(raw: unknown): {
  incidents: IncidentType[];
  rejected: RejectedIncident[];
} {
  const incidents: IncidentType[] = [];
  const rejected: RejectedIncident[] = [];

  if (!Array.isArray(raw)) {
    return { incidents, rejected: [{ id: null, error: "incidents was not an array" }] };
  }

  for (const entry of raw) {
    const result = Incident.safeParse(entry);
    if (result.success) {
      incidents.push(normalize(result.data));
    } else {
      rejected.push({ id: idOf(entry), error: describe(result.error) });
    }
  }

  return { incidents, rejected };
}

function parseEnvelope(raw: unknown): { page: PageType; body: Record<string, unknown> } {
  if (typeof raw !== "object" || raw === null) {
    throw new StatuspageParseError("response was not a JSON object");
  }
  const body = raw as Record<string, unknown>;
  const page = Page.safeParse(body["page"]);
  if (!page.success) {
    throw new StatuspageParseError(`page envelope invalid — ${describe(page.error)}`);
  }
  return { page: page.data, body };
}

/** Parse `/api/v2/summary.json`, the primary poll target. */
export function parseSummary(raw: unknown): ParsedFeed {
  const { page, body } = parseEnvelope(raw);
  const { incidents, rejected } = parseIncidents(body["incidents"] ?? []);

  const components: IncidentComponentType[] = [];
  if (Array.isArray(body["components"])) {
    for (const entry of body["components"]) {
      const result = IncidentComponent.safeParse(entry);
      // A component we cannot read costs us a label, not an incident.
      if (result.success && isRealComponent(result.data)) components.push(result.data);
    }
  }

  return { page, components, incidents, rejected };
}

/** Parse `/api/v2/incidents.json`, used for backfill and resolution catch-up. */
export function parseIncidentsResponse(raw: unknown): ParsedFeed {
  const { page, body } = parseEnvelope(raw);
  const { incidents, rejected } = parseIncidents(body["incidents"] ?? []);
  return { page, components: [], incidents, rejected };
}
