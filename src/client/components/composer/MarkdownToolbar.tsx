/**
 * The strip above the textarea.
 *
 * Entirely parody: Write/Preview and every formatting control go to the unicorn
 * page. It is a real Radix toolbar anyway, because the accessibility of a row
 * of buttons should not depend on whether the buttons do anything — and if
 * Preview is ever built, the container it needs is already the right one.
 */
import { goDead } from "../ui/dead.js";
import {
  CrossReferenceIcon,
  ImageIcon,
  LinkIcon,
  MentionIcon,
  OrderedListIcon,
  QuoteIcon,
  ReplyIcon,
  TaskListIcon,
  UnorderedListIcon,
} from "../ui/icons.js";
import { Toolbar, ToolbarButton, ToolbarSeparator } from "../ui/toolbar.js";

export function MarkdownToolbar() {
  return (
    <div className="composer-tabs">
      <div className="tabs">
        <button className="tab active" type="button" onClick={goDead}>
          Write
        </button>
        <button className="tab" type="button" onClick={goDead}>
          Preview
        </button>
      </div>

      <Toolbar className="md-toolbar" aria-label="Formatting">
        <ToolbarButton aria-label="Heading" onClick={goDead}>
          <span className="glyph">H</span>
        </ToolbarButton>
        <ToolbarButton aria-label="Bold" onClick={goDead}>
          <span className="glyph">B</span>
        </ToolbarButton>
        <ToolbarButton aria-label="Italic" onClick={goDead}>
          <span className="glyph italic">I</span>
        </ToolbarButton>

        <ToolbarSeparator />

        <ToolbarButton aria-label="Quote" onClick={goDead}>
          <QuoteIcon />
        </ToolbarButton>
        <ToolbarButton aria-label="Code" onClick={goDead}>
          <span className="glyph">&lt;&gt;</span>
        </ToolbarButton>
        <ToolbarButton aria-label="Link" onClick={goDead}>
          <LinkIcon />
        </ToolbarButton>

        <ToolbarSeparator />

        <ToolbarButton aria-label="Bulleted list" onClick={goDead}>
          <UnorderedListIcon />
        </ToolbarButton>
        <ToolbarButton aria-label="Numbered list" onClick={goDead}>
          <OrderedListIcon />
        </ToolbarButton>
        <ToolbarButton aria-label="Task list" onClick={goDead}>
          <TaskListIcon />
        </ToolbarButton>

        <ToolbarSeparator />

        <ToolbarButton aria-label="Mention someone" onClick={goDead}>
          <MentionIcon />
        </ToolbarButton>
        <ToolbarButton aria-label="Attach an image" onClick={goDead}>
          <ImageIcon />
        </ToolbarButton>
        <ToolbarButton aria-label="Reference an issue" onClick={goDead}>
          <CrossReferenceIcon />
        </ToolbarButton>
        <ToolbarButton aria-label="Reply" onClick={goDead}>
          <ReplyIcon />
        </ToolbarButton>
      </Toolbar>
    </div>
  );
}
