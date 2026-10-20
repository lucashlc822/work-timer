import { CODE_LENGTH } from '../../src/features/account/domain/auth';

import { localStack } from './localStack';

/**
 * The local stack's fake inbox (Mailpit). Every email the local stack sends
 * lands here and nowhere else, which is how the tests read the 6-digit codes.
 */

interface MessageSummary {
  ID: string;
  Created: string;
}

const CODE = new RegExp(`\\b(\\d{${CODE_LENGTH}})\\b`);

/**
 * Waits for the newest email to `email` sent at or after `since` (epoch ms)
 * and returns the code in it.
 */
export const waitForCode = async (
  email: string,
  { since, timeoutMs = 20_000 }: { since: number; timeoutMs?: number },
): Promise<string> => {
  const inbox = localStack().inboxUrl;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await fetch(
      `${inbox}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    );
    if (search.ok) {
      const { messages } = (await search.json()) as { messages: MessageSummary[] };
      // A second of slack: the inbox and this process share a clock, but not
      // to the millisecond.
      const newest = messages
        .filter((m) => Date.parse(m.Created) >= since - 1000)
        .sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created))[0];
      if (newest !== undefined) {
        const message = (await (await fetch(`${inbox}/api/v1/message/${newest.ID}`)).json()) as {
          Text?: string;
          HTML?: string;
        };
        const match = CODE.exec(message.Text ?? '') ?? CODE.exec(message.HTML ?? '');
        if (match?.[1] !== undefined) return match[1];
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No ${CODE_LENGTH}-digit code reached ${email} in the local inbox (${inbox}).`);
};
