import { describe, expect, it } from 'vitest';
import { eventItineraryHref } from './eventItinerary';

describe('eventItineraryHref', () => {
  it('builds a maps search link from the free-text location', () => {
    expect(eventItineraryHref('Gymnase du Vigneau')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Gymnase%20du%20Vigneau',
    );
  });

  it('escapes everything a French gym address actually contains', () => {
    // Accents, a comma, an ampersand and a hash all break a raw query string;
    // the whole point of encodeURIComponent here is that `location` is free
    // text a club secretary typed, not a validated address.
    const href = eventItineraryHref('12 rue de la Gournerie, 44800 Saint-Herblain #2 & annexe');
    expect(href).toContain('query=12%20rue%20de%20la%20Gournerie%2C%2044800');
    expect(href).toContain('%23');
    expect(href).toContain('%26');
    expect(href).not.toContain(' ');
  });
});
