import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { db, type TagColor } from '@/shared/db';
import { systemClock } from '@/shared/lib';

import { createTag, TagLimitError, TagNameInvalidError } from '../data/tagRepository';
import { MAX_ACTIVE_TAGS, MAX_TAG_NAME_LENGTH, TAG_NAME_MESSAGES } from '../domain/tags';
import { useTags } from '../hooks/useTags';
import { ColorSwatches } from './ColorSwatches';
import { TagDot } from './TagDot';
import { TagManager } from './TagManager';

interface Props {
  value: string | null;
  onChange: (tagId: string | null) => void;
  disabled?: boolean;
}

/**
 * Chooses the tag for a session: a pill showing the current one that opens a
 * small panel to pick, create or manage tags.
 *
 * A `value` pointing at an archived or missing tag displays as "No tag" — the
 * pill never names a tag the list no longer offers.
 */
export const TagPicker = ({ value, onChange, disabled = false }: Props) => {
  const { all, active } = useTags();
  const [open, setOpen] = useState(false);
  const [managing, setManaging] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const current = active.find((t) => t.id === value) ?? null;

  // Close on an outside press or Escape; the panel never traps focus. Escape
  // from inside the panel hands focus back to the pill rather than the page.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (root.current !== null && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (root.current?.contains(document.activeElement) === true) trigger.current?.focus();
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // A picker that becomes disabled (the session ended) must not stay open.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const choose = (tagId: string | null) => {
    if (tagId !== value) onChange(tagId);
    // The option is about to disappear with the panel; keep focus on the pill.
    trigger.current?.focus();
    setOpen(false);
  };

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
        className="rounded-pill border-night-600 text-ink-secondary hover:border-lavender-400 hover:text-ink-primary flex items-center gap-2 border px-4 py-1.5 text-xs transition-colors disabled:opacity-60"
      >
        {current !== null ? (
          <>
            <TagDot color={current.color} />
            {current.name}
          </>
        ) : (
          'No tag'
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Choose a tag"
          className="bg-night-800 border-night-600 rounded-soft absolute top-full left-1/2 z-30 mt-2 flex w-64 -translate-x-1/2 flex-col gap-3 border p-3 text-left shadow-lg"
        >
          {managing ? (
            <>
              <TagManager tags={all} selectedId={value} onArchivedSelected={() => onChange(null)} />
              <PanelLink onClick={() => setManaging(false)}>Done</PanelLink>
            </>
          ) : (
            <>
              <ul className="flex max-h-48 flex-col overflow-y-auto">
                <Option selected={current === null} onClick={() => choose(null)}>
                  No tag
                </Option>
                {active.map((tag) => (
                  <Option
                    key={tag.id}
                    selected={tag.id === current?.id}
                    onClick={() => choose(tag.id)}
                  >
                    <TagDot color={tag.color} />
                    {tag.name}
                  </Option>
                ))}
              </ul>
              {active.length < MAX_ACTIVE_TAGS && (
                <NewTagForm
                  taken={active.length}
                  onCreated={(id) => {
                    choose(id);
                  }}
                />
              )}
              {all.length > 0 && (
                <PanelLink onClick={() => setManaging(true)}>Manage tags</PanelLink>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

const Option = ({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) => (
  <li>
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`hover:bg-night-700 rounded-soft flex w-full items-center gap-2 px-2 py-1.5 text-sm transition-colors ${
        selected ? 'text-ink-primary' : 'text-ink-secondary'
      }`}
    >
      {children}
      {selected && (
        <span aria-hidden="true" className="text-lavender-300 ml-auto text-xs">
          ✓
        </span>
      )}
    </button>
  </li>
);

const PanelLink = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className="text-ink-muted hover:text-ink-primary self-start text-xs transition-colors"
  >
    {children}
  </button>
);

/** New tags default to the next unused-looking colour, so a first few look distinct. */
const COLOR_ORDER: readonly TagColor[] = ['lavender', 'mint', 'rose', 'gold', 'sky', 'peach'];

const NewTagForm = ({ taken, onCreated }: { taken: number; onCreated: (id: string) => void }) => {
  const [name, setName] = useState('');
  const [color, setColor] = useState<TagColor>(
    COLOR_ORDER[taken % COLOR_ORDER.length] ?? 'lavender',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const tag = await createTag(db, { name, color }, systemClock);
      setName('');
      setError(null);
      onCreated(tag.id);
    } catch (e) {
      if (e instanceof TagNameInvalidError) setError(TAG_NAME_MESSAGES[e.reason]);
      else if (e instanceof TagLimitError)
        setError(`You can keep ${MAX_ACTIVE_TAGS} active tags at most.`);
      else {
        console.error('Could not create the tag', e);
        setError('The tag could not be saved.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="border-night-600 flex flex-col gap-2 border-t pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          placeholder="New tag"
          aria-label="New tag name"
          maxLength={MAX_TAG_NAME_LENGTH + 8}
          className="bg-night-900 border-night-600 text-ink-primary placeholder:text-ink-muted rounded-soft min-w-0 flex-1 border px-2 py-1 text-sm"
        />
        <button
          type="submit"
          disabled={busy || name.trim() === ''}
          className="rounded-pill bg-lavender-400 text-night-900 hover:bg-lavender-300 px-3 py-1 text-xs transition-colors disabled:opacity-50"
        >
          Add
        </button>
      </div>
      <ColorSwatches label="Colour for the new tag" value={color} onChange={setColor} />
      {error !== null && (
        <p role="alert" className="text-faded text-xs">
          {error}
        </p>
      )}
    </form>
  );
};
