import type { EventSharePlatform } from '@basketeasy/types/whatsapp-reminder';

const canShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/**
 * Hands the message to WhatsApp and reports how, so the confirm row can record
 * the platform. `null` means the user backed out of the share sheet: nothing
 * was shared and there is nothing to confirm. The web has no completion signal
 * for either route, which is why a share always ends in an explicit confirm.
 */
export async function shareMessage(message: string): Promise<EventSharePlatform | null> {
  if (canShare()) {
    try {
      await navigator.share({ text: message });
      return 'SHARE_SHEET';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return null;
      // Any other refusal (no share target, blocked): fall through to wa.me.
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  return 'WA_ME';
}

/** Rejects when the clipboard is unavailable; the caller says so. */
export async function copyMessage(message: string): Promise<EventSharePlatform> {
  await navigator.clipboard.writeText(message);
  return 'COPY';
}
