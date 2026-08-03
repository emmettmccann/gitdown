/**
 * The account menu behind the avatar in the header.
 *
 * Almost everything github.com hangs off this avatar is something gitdown has
 * no version of, so rather than fill it with more dead chrome it carries the
 * three links that are real and the one control that is: the name you are
 * posting under. It is the same editor the composer has — a resolved thread has
 * no composer, so this is the only place to change it from most of the site.
 */
import { SOURCE_URL, SPONSOR_URL, STATUS_PAGE_URL } from "../../lib/constants.js";
import { cn } from "../../lib/cn.js";
import { avatarClass, useSession } from "../../lib/session.js";
import { useDisplayNameEditor } from "../../lib/useDisplayNameEditor.js";
import { NameField } from "../common/NameField.js";
import { Button } from "../ui/button.js";
import { HeartIcon, MarkGithubIcon, BookIcon } from "../ui/icons.js";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover.js";

export function ProfileMenu() {
  const session = useSession();
  const editor = useDisplayNameEditor();

  return (
    <Popover
      onOpenChange={(open) => {
        // Reopening should offer the name as it now stands, not a half-typed
        // draft from the last time the menu was up.
        if (!open) editor.cancel();
      }}
    >
      <PopoverTrigger asChild>
        <button className="avatar-btn" type="button" aria-label="Open user account menu">
          {/* `avatar` alongside `avatar-me` is what picks the palette colour up:
              the trigger and the face inside the menu are the same visitor. */}
          <span className={cn("avatar-me avatar", avatarClass(session.id))} />
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="profile-menu"
        aria-label="Account"
        onEscapeKeyDown={(event) => {
          // Backing out of a rename should not take the menu with it. Radix
          // listens for Escape on the document in the capture phase, so the
          // field below cannot stop it from bubbling — preventing it here is
          // the way to keep the layer open, and the field's own handler still
          // runs afterwards to close the editor.
          if (editor.editing) event.preventDefault();
        }}
      >
        <div className="profile-menu-header">
          <span className={cn("avatar", avatarClass(session.id))} />
          {editor.editing ? (
            <NameField editor={editor} />
          ) : (
            <>
              <span className="who">{session.displayName}</span>
              <Button variant="link" onClick={editor.start}>
                Change
              </Button>
            </>
          )}
        </div>

        {editor.error && <div className="profile-menu-error">{editor.error}</div>}

        <div className="profile-menu-separator" />

        <nav className="profile-menu-links">
          <a href={STATUS_PAGE_URL}>
            <MarkGithubIcon />
            Real Github Status
          </a>
          <a href={SOURCE_URL} rel="noopener">
            <BookIcon />
            Source
          </a>
          <a href={SPONSOR_URL} rel="noopener">
            <HeartIcon />
            Paid version
          </a>
        </nav>
      </PopoverContent>
    </Popover>
  );
}
