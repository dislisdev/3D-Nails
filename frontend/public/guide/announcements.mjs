// Πειραματικό · Οδηγός λήψης 0.1.1 · ρυθμός ανακοινώσεων του G1.
import { CAPTURE_RULES } from './targets.mjs';

export function createAnnouncer(clock, speak) {
  let lastAt = -Infinity;
  let lastMessage = '';
  let pending;
  let timer;

  function flush() {
    timer = undefined;
    const message = pending?.message;
    pending = null;
    if (!message || message === lastMessage) return;
    lastAt = clock.now();
    lastMessage = message;
    speak(message);
  }

  return {
    offer(message, priority = false) {
      if (!pending?.priority || priority) pending = { message, priority };
      if (timer !== undefined) return;
      const wait = CAPTURE_RULES.announcementMs - (clock.now() - lastAt);
      if (wait <= 0) flush();
      else timer = clock.setTimeout(flush, wait);
    },
    clear() {
      clock.clearTimeout(timer);
      timer = undefined;
      pending = null;
      lastMessage = '';
    },
  };
}
