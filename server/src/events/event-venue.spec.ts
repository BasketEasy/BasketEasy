import {
  UNKNOWN_EVENT_LOCATION,
  eventVenueLabel,
  isSameEventLocation,
} from '@basketeasy/types/events';

// The shared display and « did the venue change » rules, tested here because
// @basketeasy/types has no test runner of its own.
describe('eventVenueLabel', () => {
  it('reads as the gym name when one was given', () => {
    expect(eventVenueLabel({ location: '12 rue des Sports', locationName: 'Trocardière' })).toBe(
      'Trocardière',
    );
  });

  it('falls back to the address', () => {
    expect(eventVenueLabel({ location: '12 rue des Sports', locationName: null })).toBe(
      '12 rue des Sports',
    );
    expect(eventVenueLabel({ location: UNKNOWN_EVENT_LOCATION, locationName: null })).toBe(
      UNKNOWN_EVENT_LOCATION,
    );
  });
});

describe('isSameEventLocation', () => {
  it('ignores case and surrounding or repeated whitespace', () => {
    expect(isSameEventLocation(' 12 Rue des  Sports ', '12 rue des sports')).toBe(true);
  });

  it('tells two addresses apart', () => {
    expect(isSameEventLocation('12 rue des Sports', '14 rue des Sports')).toBe(false);
  });
});
