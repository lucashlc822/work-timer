const number = new Intl.NumberFormat();

/** "1,240 Stardust" — the one way an amount is written. */
export const stardust = (amount: number): string => `${number.format(amount)} Stardust`;

/** "+25" / "−300", with a real minus sign. */
export const signed = (delta: number): string =>
  delta < 0 ? `\u2212${number.format(-delta)}` : `+${number.format(delta)}`;
