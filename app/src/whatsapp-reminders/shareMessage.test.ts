import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyMessage, shareMessage } from './shareMessage';

const originalShare = Object.getOwnPropertyDescriptor(navigator, 'share');

function setShare(share: unknown) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
}

afterEach(() => {
  if (originalShare) Object.defineProperty(navigator, 'share', originalShare);
  else Reflect.deleteProperty(navigator, 'share');
  vi.restoreAllMocks();
});

describe('shareMessage', () => {
  it('uses the share sheet when there is one', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShare(share);

    await expect(shareMessage('Salut 🏀')).resolves.toBe('SHARE_SHEET');
    expect(share).toHaveBeenCalledWith({ text: 'Salut 🏀' });
  });

  it('opens wa.me with the encoded text without navigator.share', async () => {
    setShare(undefined);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    await expect(shareMessage('a b\nc&d')).resolves.toBe('WA_ME');
    expect(open).toHaveBeenCalledWith('https://wa.me/?text=a%20b%0Ac%26d', '_blank', 'noopener');
  });

  it('reports nothing when the user backs out of the share sheet', async () => {
    setShare(vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')));
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    await expect(shareMessage('x')).resolves.toBeNull();
    expect(open).not.toHaveBeenCalled();
  });

  it('falls back to wa.me when the share sheet fails for another reason', async () => {
    setShare(vi.fn().mockRejectedValue(new DOMException('nope', 'NotAllowedError')));
    vi.spyOn(window, 'open').mockReturnValue(null);

    await expect(shareMessage('x')).resolves.toBe('WA_ME');
  });
});

describe('copyMessage', () => {
  it('writes to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    await expect(copyMessage('hello')).resolves.toBe('COPY');
    expect(writeText).toHaveBeenCalledWith('hello');
  });
});
