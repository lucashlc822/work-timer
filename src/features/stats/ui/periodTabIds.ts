import type { PeriodKind } from '../domain/period';

/** The one panel every period tab controls: its contents are whichever period is selected. */
export const PERIOD_PANEL_ID = 'stats-panel';
export const periodTabId = (kind: PeriodKind): string => `stats-tab-${kind}`;
