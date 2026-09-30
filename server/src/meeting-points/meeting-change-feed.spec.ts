import { MeetingChangeFeed } from './meeting-change-feed';

describe('MeetingChangeFeed', () => {
  it('hands the ids to every subscriber', () => {
    const feed = new MeetingChangeFeed();
    const a = jest.fn();
    const b = jest.fn();
    feed.subscribe(a);
    feed.subscribe(b);

    feed.publish(['e1', 'e2']);

    expect(a).toHaveBeenCalledWith(['e1', 'e2']);
    expect(b).toHaveBeenCalledWith(['e1', 'e2']);
  });

  it('publishes nothing for an empty batch', () => {
    const feed = new MeetingChangeFeed();
    const listener = jest.fn();
    feed.subscribe(listener);
    feed.publish([]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('stops calling a listener once it unsubscribes', () => {
    const feed = new MeetingChangeFeed();
    const listener = jest.fn();
    const unsubscribe = feed.subscribe(listener);
    unsubscribe();
    feed.publish(['e1']);
    expect(listener).not.toHaveBeenCalled();
  });

  it('never throws back into the publisher, sync or async, and still reaches the others', async () => {
    const feed = new MeetingChangeFeed();
    const after = jest.fn();
    feed.subscribe(() => {
      throw new Error('sync boom');
    });
    feed.subscribe(() => Promise.reject(new Error('async boom')));
    feed.subscribe(after);

    expect(() => feed.publish(['e1'])).not.toThrow();
    await Promise.resolve();

    expect(after).toHaveBeenCalledWith(['e1']);
  });
});
