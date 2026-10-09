import { useRef, useState } from 'react';

import { db, type TagRow } from '@/shared/db';
import { systemClock } from '@/shared/lib';

import {
  recolorTag,
  renameTag,
  setArchived,
  TagLimitError,
  TagNameInvalidError,
} from '../data/tagRepository';
import { MAX_ACTIVE_TAGS, TAG_NAME_MESSAGES } from '../domain/tags';
import { ColorSwatches } from './ColorSwatches';
import { TagDot } from './TagDot';

const messageFor = (e: unknown): string => {
  if (e instanceof TagNameInvalidError) return TAG_NAME_MESSAGES[e.reason];
  if (e instanceof TagLimitError) return `You can keep ${MAX_ACTIVE_TAGS} active tags at most.`;
  console.error('Tag change failed', e);
  return 'That change could not be saved.';
};

interface Props {
  tags: readonly TagRow[];
  /** Called when the tag being archived is the one currently picked. */
  onArchivedSelected: () => void;
  selectedId: string | null;
}

/**
 * Rename, recolour and archive. Archiving is the only way to remove a tag:
 * sessions already tagged keep their label, and an archived tag can be brought
 * back from here.
 */
export const TagManager = ({ tags, selectedId, onArchivedSelected }: Props) => {
  const [error, setError] = useState<string | null>(null);

  /** Resolves to whether the change was saved; failures are shown, not thrown. */
  const run = async (change: () => Promise<void>): Promise<boolean> => {
    try {
      await change();
      setError(null);
      return true;
    } catch (e) {
      setError(messageFor(e));
      return false;
    }
  };

  if (tags.length === 0) {
    return <p className="text-ink-muted px-1 py-2 text-xs">No tags yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
        {tags.map((tag) => (
          <li
            key={tag.id}
            className={`border-night-600 flex flex-col gap-1.5 rounded-lg border p-2 ${
              tag.archivedAt !== null ? 'opacity-60' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <TagDot color={tag.color} />
              <RenameField
                key={tag.updatedAt}
                tag={tag}
                onRename={(name) => run(() => renameTag(db, tag.id, name, systemClock))}
              />
              <button
                type="button"
                onClick={() =>
                  void run(async () => {
                    const archiving = tag.archivedAt === null;
                    await setArchived(db, tag.id, archiving, systemClock);
                    if (archiving && tag.id === selectedId) onArchivedSelected();
                  })
                }
                className="text-ink-muted hover:text-ink-primary shrink-0 text-xs transition-colors"
              >
                {tag.archivedAt === null ? 'Archive' : 'Restore'}
              </button>
            </div>
            {tag.archivedAt === null && (
              <ColorSwatches
                label={`Colour for ${tag.name}`}
                value={tag.color}
                onChange={(color) => void run(() => recolorTag(db, tag.id, color, systemClock))}
              />
            )}
          </li>
        ))}
      </ul>
      {error !== null && (
        <p role="alert" className="text-faded text-xs">
          {error}
        </p>
      )}
    </div>
  );
};

/** Commits on Enter or blur; Escape abandons the edit; a rejected name snaps back. */
const RenameField = ({
  tag,
  onRename,
}: {
  tag: TagRow;
  onRename: (name: string) => Promise<boolean>;
}) => {
  const [draft, setDraft] = useState(tag.name);
  const abandoned = useRef(false);

  const commit = () => {
    if (abandoned.current) {
      abandoned.current = false;
      setDraft(tag.name);
      return;
    }
    if (draft.trim() === tag.name) return;
    void onRename(draft).then((saved) => {
      if (!saved) setDraft(tag.name);
    });
  };

  return (
    <input
      value={draft}
      aria-label={`Name of ${tag.name}`}
      disabled={tag.archivedAt !== null}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          abandoned.current = true;
          e.currentTarget.blur();
        } else if (e.key === 'Enter') {
          e.currentTarget.blur();
        }
      }}
      className="text-ink-primary min-w-0 flex-1 bg-transparent text-sm outline-none focus:underline"
    />
  );
};
