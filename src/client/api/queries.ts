/**
 * The data layer: every request the browser makes, described once.
 *
 * The polling loop this replaces (`poll.ts`) hand-rolled four behaviours, and
 * TanStack Query already has all four — so they are configuration here rather
 * than code:
 *
 *  - **Pause when hidden.** `refetchIntervalInBackground` defaults to false, so
 *    the interval only fires while the tab is being looked at. People leave
 *    outage tabs open for hours and a tab nobody is watching should cost
 *    nothing.
 *  - **Catch up on return.** `refetchOnWindowFocus` fetches once on the way
 *    back, so a tab that was hidden for an hour is current the moment it is not.
 *  - **Jitter.** `refetchInterval` is re-evaluated every tick, so returning a
 *    spread value from it keeps clients that loaded during the spike from
 *    polling in lockstep forever.
 *  - **Stop when closed.** Returning `false` ends the interval. A frozen thread
 *    can never change again, so polling it is pure waste.
 */
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { IssueState, TimelineEntry } from "../../shared/api.js";
import type { Session } from "../lib/session.js";
import { setDisplayName } from "../lib/session.js";
import {
  ApiError,
  fetchIssue,
  fetchIssues,
  fetchTimeline,
  postComment,
  putDisplayName,
} from "./client.js";
import {
  addEntry,
  applyUpdate,
  failEntry,
  fromDetail,
  lock,
  removeEntry,
  replaceEntry,
  type Thread,
} from "./thread.js";

/** Live threads move on the order of minutes; 5s feels instant enough. */
const POLL_INTERVAL_MS = 5_000;
/** Fractional spread applied either side of the interval. */
const POLL_JITTER = 0.2;
/**
 * A burst bigger than one timeline page arrives over several requests. Waiting
 * a full interval between them would show the thread filling in visibly, so the
 * backlog is drained at speed and only the steady state is jittered.
 */
const CATCH_UP_MS = 400;

function pollDelay(): number {
  return POLL_INTERVAL_MS * (1 + (Math.random() * 2 - 1) * POLL_JITTER);
}

export const queryKeys = {
  issues: (state: IssueState, page: number) => ["issues", state, page] as const,
  thread: (issueNumber: number) => ["thread", issueNumber] as const,
};

/**
 * A `404` is never going to become a `200`, and neither is a malformed request.
 * Only trouble on the server's side is worth asking about twice.
 */
function retryPolicy(failureCount: number, error: Error): boolean {
  if (error instanceof ApiError && error.status < 500) return false;
  return failureCount < 2;
}

export function issuesQuery(state: IssueState, page: number) {
  return queryOptions({
    queryKey: queryKeys.issues(state, page),
    queryFn: () => fetchIssues(state, page),
    retry: retryPolicy,
  });
}

/**
 * The live thread.
 *
 * One query key covers both the first load and every poll after it, because to
 * a component they are the same question — "what does this thread look like
 * now?" — and only the fetch differs. The first answer comes from the issue
 * endpoint; the rest are increments from the cursor, folded into what is
 * already held.
 */
export function useThread(issueNumber: number, enabled = true) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.thread(issueNumber);

  return useQuery({
    enabled,
    queryKey,
    queryFn: async (): Promise<Thread> => {
      const held = queryClient.getQueryData<Thread>(queryKey);
      if (!held) return fromDetail(await fetchIssue(issueNumber));
      // Frozen forever: nothing to ask about.
      if (held.state === "closed") return held;
      return applyUpdate(held, await fetchTimeline(issueNumber, held.cursor));
    },
    refetchInterval: ({ state }) => {
      const thread = state.data;
      if (!thread || thread.state === "closed") return false;
      return thread.hasMore ? CATCH_UP_MS : pollDelay();
    },
    retry: retryPolicy,
    // Coming back to a thread inside the poll window should not cost a request
    // the poller was about to make anyway.
    staleTime: POLL_INTERVAL_MS,
  });
}

/** SPEC 9.3: the composer is about to disappear, so the card has to say why. */
const LOCKED_MESSAGE =
  "GitHub resolved the incident before this landed, so the thread locked and it was not posted.";

export interface CommentDraft {
  body: string;
  session: Session;
}

/**
 * Posting a comment, rendered before it is sent (SPEC 9.2).
 *
 * Even at 50ms an optimistic row beats a spinner, and it is what makes putting
 * a queue on the write path later change nothing the visitor can see.
 */
export function useComment(issueNumber: number) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.thread(issueNumber);

  const update = (change: (thread: Thread) => Thread): void => {
    queryClient.setQueryData<Thread>(queryKey, (thread) => thread && change(thread));
  };

  return useMutation({
    mutationFn: ({ body, session }: CommentDraft) =>
      postComment(issueNumber, {
        sessionId: session.id,
        token: session.token,
        displayName: session.displayName,
        body,
      }),

    onMutate: async ({ body, session }: CommentDraft) => {
      // A poll that resolves mid-write would write back a thread from before
      // the optimistic row existed, and the row would flicker out.
      await queryClient.cancelQueries({ queryKey });

      const optimisticId = `pending:${crypto.randomUUID()}`;
      const entry: TimelineEntry = {
        seq: 0,
        id: optimisticId,
        kind: "comment",
        actor: session.id,
        body,
        meta: { name: session.displayName },
        createdAt: Date.now(),
        editedAt: null,
        deleted: false,
      };
      update((thread) => addEntry(thread, { ...entry, pending: true }));
      return { optimisticId };
    },

    onSuccess: ({ entry }, _draft, context) => {
      update((thread) => replaceEntry(thread, context.optimisticId, entry));
    },

    onError: (error, _draft, context) => {
      if (!context) return;
      if (error instanceof ApiError && error.status === 409) {
        // The incident resolved while this was in flight. The thread locks and
        // the card stays as the only place the text still exists.
        update((thread) => lock(failEntry(thread, context.optimisticId, LOCKED_MESSAGE)));
        return;
      }
      // Recoverable: drop the placeholder. The composer puts the text back.
      update((thread) => removeEntry(thread, context.optimisticId));
    },
  });
}

export interface RenameDraft {
  session: Session;
  displayName: string;
}

/**
 * Changing your display name (SPEC 8).
 *
 * The server only takes the name off a comment when the session is new, so an
 * established name is changed here rather than by waiting for the next comment
 * to carry a new one.
 */
export function useRename() {
  return useMutation({
    mutationFn: async ({ session, displayName }: RenameDraft): Promise<string> => {
      try {
        const result = await putDisplayName({
          sessionId: session.id,
          token: session.token,
          displayName,
        });
        return result.displayName;
      } catch (failure) {
        // 404 means this session has never posted, so there is no server row to
        // rename yet. The name is still the visitor's to choose — the first
        // comment will establish it.
        if (failure instanceof ApiError && failure.status === 404) return displayName;
        throw failure;
      }
    },
    onSuccess: (displayName) => {
      setDisplayName(displayName);
    },
  });
}
