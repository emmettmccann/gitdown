/**
 * Renaming yourself, as a state machine (SPEC 8).
 *
 * Two places offer it now — the composer's "Commenting as" line and the profile
 * menu in the header — and they lay it out differently but behave identically.
 * The behaviour lives here; each caller supplies its own markup. Both read the
 * name from the same session store, so a rename in one repaints the other.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { ApiError } from "../api/client.js";
import { useRename } from "../api/queries.js";
import { useSession } from "./session.js";

export interface DisplayNameEditor {
  editing: boolean;
  draft: string;
  setDraft: (value: string) => void;
  start: () => void;
  cancel: () => void;
  commit: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  /** Ready to show; null when nothing has gone wrong. */
  error: string | null;
  isPending: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
}

function errorMessage(error: Error | null): string | null {
  if (!error) return null;
  return error instanceof ApiError && error.status === 400
    ? "Pick a different name — that one is reserved or too long."
    : "Could not change that right now.";
}

export function useDisplayNameEditor(): DisplayNameEditor {
  const session = useSession();
  const rename = useRename();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const start = () => {
    rename.reset();
    setDraft(session.displayName);
    setEditing(true);
  };

  const cancel = () => {
    rename.reset();
    setEditing(false);
  };

  const commit = () => {
    const wanted = draft.trim();
    if (wanted.length === 0 || rename.isPending) return;
    rename.mutate({ session, displayName: wanted }, { onSuccess: () => setEditing(false) });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      // This field sits inside the composer's `<form>`, and HTML has no nested
      // forms to put it in — so Enter is bound here, and stopped from reaching
      // the form, where it would post the comment instead of saving the name.
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  };

  return {
    editing,
    draft,
    setDraft,
    start,
    cancel,
    commit,
    onKeyDown,
    error: errorMessage(rename.error),
    isPending: rename.isPending,
    inputRef,
  };
}
