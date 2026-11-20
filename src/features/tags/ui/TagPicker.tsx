import { AnimatePresence } from 'motion/react';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { db, type TagColor } from '@/shared/db';
import { systemClock } from '@/shared/lib';
import { PopoverPanel } from '@/shared/ui/motion';

import { createTag, TagLimitError, TagNameInvalidError } from '../data/tagRepository';
import { MAX_ACTIVE_TAGS, MAX_TAG_NAME_LENGTH, TAG_NAME_MESSAGES } from '../domain/tags';
import { placePopover, type Placement } from '../domain/popoverPlacement';
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
  // Which side of the pill the panel opens on, and how tall it may be (UI review M3).
  const [placement, setPlacement] = useState<Placement>({ side: 'below', maxHeight: 0 });

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

  // Measured before paint, when the panel opens and when its content changes
  // (managing tags is taller), and again if the window is resized while it is open.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const pill = trigger.current;
      const panel = root.current?.querySelector<HTMLElement>(`[id="${panelId}"]`);
      if (pill == null || panel == null) return;
      const r = pill.getBoundingClientRect();
      // The panel's own height is capped by the last placement; its content's height is not.
      setPlacement(
        placePopover({
          triggerTop: r.top,
          triggerBottom: r.bottom,
          windowHeight: window.innerHeight,
          contentHeight: panel.scrollHeight,
        }),
      );
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, managing, panelId, all.length, active.length]);

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
        className="rounded-pill border-night-600 text-ink-secondary hover:border-lavender-400 hover:text-ink-primary pressable flex items-center gap-2 border px-4 py-1.5 text-xs disabled:opacity-60"
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

      <AnimatePresence>
        {open && (
          <PopoverPanel
            key="tag-popover"
            id={panelId}
            label="Choose a tag"
            origin={placement.side === 'above' ? 'bottom center' : 'top center'}
            {...(placement.maxHeight > 0 && { maxHeight: placement.maxHeight })}
            className={`bg-night-800 border-night-600 rounded-soft absolute left-1/2 z-30 flex w-64 -translate-x-1/2 flex-col gap-3 overflow-y-auto border p-3 text-left shadow-lg ${
              placement.side === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'
            }`}
          >
            {managing ? (
              <>
                <TagManager
                  tags={all}
                  selectedId={value}
                  onArchivedSelected={() => onChange(null)}
                />
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
          </PopoverPanel>
        )}
      </AnimatePresence>
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
    className="text-ink-muted hover:text-ink-primary -my-1 self-start py-1 text-xs transition-colors"
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
          className="rounded-pill bg-lavender-400 text-night-900 hover:bg-lavender-300 pressable px-3 py-1 text-xs disabled:opacity-50"
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
