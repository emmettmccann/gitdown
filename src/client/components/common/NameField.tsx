import { MAX_NAME_LENGTH } from "../../../shared/api.js";
import type { DisplayNameEditor } from "../../lib/useDisplayNameEditor.js";
import { Button } from "../ui/button.js";

/**
 * The rename input and its Save button, shared by the composer and the profile
 * menu.
 *
 * Not a `<form>`, deliberately: in the composer it lives inside the one that
 * posts the comment, and HTML has no nested forms. `Button` defaults to
 * `type="button"`, so Save cannot submit the form around it, and Enter is
 * handled by the editor's own key handler instead of by implicit submission.
 */
export function NameField({ editor }: { editor: DisplayNameEditor }) {
  return (
    <span className="identity-edit">
      <input
        ref={editor.inputRef}
        type="text"
        autoFocus
        maxLength={MAX_NAME_LENGTH}
        aria-label="Display name"
        value={editor.draft}
        onChange={(event) => editor.setDraft(event.target.value)}
        onKeyDown={editor.onKeyDown}
      />
      <Button onClick={editor.commit} disabled={editor.isPending}>
        Save
      </Button>
    </span>
  );
}
