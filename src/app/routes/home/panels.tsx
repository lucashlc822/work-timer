import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

import { CompletionSoundSwitch } from '@/features/timer';
import { getRuntime, type AutostartPort } from '@/shared/runtime';
import { Switch, useFocusHeading } from '@/shared/ui';

/** The views that scroll over the timer; each gets a footer for its Back button. */
export const PANEL_VIEWS: ReadonlySet<string> = new Set([
  'stats',
  'stardust',
  'account',
  'friends',
  'together',
]);

/**
 * A panel over the dimmed sky: the content scrolls above a footer that holds
 * the Back button, so the button never sits on top of the content. It opens
 * on the panel's title, so the first control is one Tab away and Back is the
 * last stop; with no title, on Back, so focus never falls to the page.
 */
export const PanelLayer = ({
  children,
  back,
  backRef,
}: {
  children: ReactNode;
  back: ReactNode;
  backRef: RefObject<HTMLButtonElement | null>;
}) => {
  const content = useRef<HTMLDivElement>(null);
  useFocusHeading(content, backRef);
  return (
    <div className="bg-night-900/85 fixed inset-0 z-10 flex flex-col backdrop-blur-sm">
      {/* The gutter is always reserved: with classic scrollbars (Windows) a tab
          that scrolls would otherwise be 15 px narrower than one that fits. */}
      <div ref={content} className="min-h-0 flex-1 scrollbar-gutter-stable overflow-y-auto">
        {children}
      </div>
      <footer className="border-night-700 flex justify-center border-t py-3">{back}</footer>
    </div>
  );
};

/** "Back to timer" / "Back to friends": in a panel's footer, or floating over a view that doesn't scroll. */
export const BackButton = ({
  label,
  floating,
  buttonRef,
  onClick,
}: {
  label: string;
  floating: boolean;
  buttonRef: RefObject<HTMLButtonElement | null>;
  onClick: () => void;
}) => (
  <button
    ref={buttonRef}
    type="button"
    // A floating Back is the only control over a sky; in a panel the title is focused instead.
    autoFocus={floating}
    onClick={onClick}
    className={`rounded-pill border-night-600 text-ink-secondary hover:text-ink-primary pressable border px-5 py-2 text-xs ${
      floating
        ? 'bg-night-800/80 fixed bottom-6 left-1/2 z-20 -translate-x-1/2 backdrop-blur'
        : 'bg-night-800'
    }`}
  >
    {label}
  </button>
);

/** A footer navigation button: no outline, so the row reads as links, not choices. */
/** "See it in your sky", on a finished session's result; same look as the timer's other quiet buttons. */
export const SkyLink = ({ onOpen }: { onOpen: () => void }) => (
  <button
    type="button"
    onClick={onOpen}
    className="rounded-pill border-night-600 text-ink-secondary hover:border-lavender-400 hover:text-ink-primary pressable border px-4 py-1.5 text-xs"
  >
    See it in your sky
  </button>
);

export const NAV_BUTTON =
  'rounded-pill text-ink-secondary hover:text-ink-primary hover:bg-night-800/60 px-3 py-1.5 text-xs pressable';

export const NO_TIERS: ReadonlySet<'medium' | 'hard'> = new Set();
export const NO_PACKS: ReadonlySet<string> = new Set();

/** "This computer": the sound everywhere, and launch at startup where the host has it. */
export const DeviceSettings = () => {
  const [autostart, setAutostart] = useState<AutostartPort | null>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getRuntime().then(async (host) => {
      if (cancelled || !host.autostart.isSupported) return;
      const on = await host.autostart.isEnabled();
      if (cancelled) return;
      setAutostart(host.autostart);
      setEnabled(on);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async () => {
    if (autostart === null) return;
    await autostart.setEnabled(!enabled);
    setEnabled(await autostart.isEnabled());
  };

  return (
    <section className="bg-night-800/70 border-night-600 rounded-soft flex flex-col gap-3 border p-4 text-sm">
      <h3 className="text-ink-primary">This computer</h3>
      <CompletionSoundSwitch />
      {autostart !== null && (
        <Switch label="Launch at startup" checked={enabled} onChange={() => void toggle()} />
      )}
    </section>
  );
};
