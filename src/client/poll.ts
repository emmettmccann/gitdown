/**
 * The polling loop (SPEC 7.1).
 *
 * Three behaviours here exist purely to keep request volume down, and each one
 * removes a meaningful slice of it:
 *
 *  - **Pause when hidden.** People leave outage tabs open for hours. A tab
 *    nobody is looking at should cost nothing.
 *  - **Jitter.** Without it, every client that loaded during the spike polls in
 *    lockstep forever, turning steady load into a recurring thundering herd.
 *  - **Stop when closed.** A frozen thread can never change again, so polling it
 *    is pure waste.
 */
export interface PollOptions {
  intervalMs: number;
  /** Fractional spread applied either side of the interval. */
  jitter?: number;
  onError?: (error: unknown) => void;
}

export interface PollHandle {
  stop: () => void;
  /** Poll immediately — used when a hidden tab becomes visible again. */
  refresh: () => void;
}

/**
 * Runs `tick` on an interval until it returns false, which means "there is
 * nothing left to watch".
 */
export function startPolling(tick: () => Promise<boolean>, options: PollOptions): PollHandle {
  const { intervalMs, jitter = 0.2, onError } = options;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let running = false;

  const delay = () => intervalMs * (1 + (Math.random() * 2 - 1) * jitter);

  const schedule = () => {
    if (stopped || document.visibilityState === "hidden") return;
    clearTimeout(timer);
    timer = setTimeout(run, delay());
  };

  async function run(): Promise<void> {
    // Guards against a visibility change firing a second concurrent poll while
    // one is still in flight.
    if (stopped || running) return;
    running = true;
    try {
      if (!(await tick())) {
        stop();
        return;
      }
    } catch (error) {
      // A failed poll is not fatal: the next one may well succeed, and the page
      // still shows everything it had.
      onError?.(error);
    } finally {
      running = false;
    }
    schedule();
  }

  function stop(): void {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  }

  function onVisibility(): void {
    if (document.visibilityState === "visible") {
      // Catch up on whatever was missed while hidden, then resume.
      void run();
    } else {
      clearTimeout(timer);
    }
  }

  document.addEventListener("visibilitychange", onVisibility);
  schedule();

  return { stop, refresh: () => void run() };
}
