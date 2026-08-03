/**
 * Who you are posting as, on the composer's footer line.
 *
 * It sits where the attachment hint used to, which is the only thing that line
 * ever said and gitdown takes no attachments. The name it shows is the one the
 * next comment will carry.
 */
import { cn } from "../../lib/cn.js";
import { avatarClass, useSession } from "../../lib/session.js";
import { useDisplayNameEditor } from "../../lib/useDisplayNameEditor.js";
import { NameField } from "../common/NameField.js";
import { Button } from "../ui/button.js";

export function IdentityBar() {
  const session = useSession();
  const editor = useDisplayNameEditor();

  return (
    <div className="composer-identity">
      <span className={cn("avatar", avatarClass(session.id))} />
      <span>
        Commenting as <strong>{session.displayName}</strong>
      </span>

      {editor.editing ? (
        <NameField editor={editor} />
      ) : (
        <Button variant="link" onClick={editor.start}>
          Change
        </Button>
      )}

      {editor.error && <span className="identity-error">{editor.error}</span>}
    </div>
  );
}
