import { useLiveQuery } from 'dexie-react-hooks';

import { db } from '@/shared/db';
import { Switch } from '@/shared/ui';

import { readCompletionSound, writeCompletionSound } from '../data/completionSound';

/**
 * "Completion sound": the soft chime when a session finishes. Per device, on
 * until turned off. Waits for its first read rather than flashing the wrong
 * position.
 */
export const CompletionSoundSwitch = () => {
  const on = useLiveQuery(() => readCompletionSound(db), []);
  if (on === undefined) return null;
  return (
    <Switch
      label="Completion sound"
      checked={on}
      onChange={(next) => void writeCompletionSound(db, next)}
    />
  );
};
