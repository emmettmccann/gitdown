/**
 * Who you are posting as.
 *
 * The name lives in localStorage and is sent with each comment, but the server
 * only takes it when the session is new — so this editor calls the rename
 * endpoint rather than relying on the next comment to carry a new name
 * (SPEC 8).
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { MAX_NAME_LENGTH } from "../../../shared/api.js";
import { ApiError } from "../../api/client.js";
import { useRename } from "../../api/queries.js";
import { avatarClass, useSession } from "../../lib/session.js";
import { cn } from "../../lib/cn.js";
import { Button } from "../ui/button.js";

function errorMessage(error: Error | null): string | null {
  if (!error) return null;
  return error instanceof ApiError && error.status === 400
    ? "Pick a different name — that one is reserved or too long."
    : "Could not change that right now.";
}

export function IdentityBar() {
  const session = useSession();
  const rename = useRename();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const startEditing = () => {
    rename.reset();
    setDraft(session.displayName);
    setEditing(true);
  };

  const commit = (event: FormEvent) => {
    event.preventDefault();
    const wanted = draft.trim();
    if (wanted.length === 0 || rename.isPending) return;
    rename.mutate(
      { session, displayName: wanted },
      { onSuccess: () => setEditing(false) },
    );
  };

  const failure = errorMessage(rename.error);

  return (
    <div className="composer-identity">
      <span className={cn("avatar", avatarClass(session.id))} />
      <span>
        Commenting as <strong>{session.displayName}</strong>
      </span>

      {editing ? (
        <form className="identity-edit" onSubmit={commit}>
          <input
            ref={input}
            type="text"
            autoFocus
            maxLength={MAX_NAME_LENGTH}
            aria-label="Display name"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" disabled={rename.isPending}>
            Save
          </Button>
        </form>
      ) : (
        <Button variant="link" onClick={startEditing}>
          Change
        </Button>
      )}

      {failure && <span className="identity-error">{failure}</span>}
    </div>
  );
}
