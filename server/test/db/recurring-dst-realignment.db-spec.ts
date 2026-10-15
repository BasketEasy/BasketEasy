import { readFileSync } from 'fs';
import { join } from 'path';
import { createClub, createTeam, prisma, resetDb } from './db';

// The migration as written, run against rows created here: the spec exercises
// the SQL that ships, not a copy of it. `now()` is pinned so the « future rows
// only » rule is testable with fixed dates.
const SQL = readFileSync(
  join(
    __dirname,
    '../../prisma/migrations/20261001090000_recurring_events_paris_wall_clock/migration.sql',
  ),
  'utf8',
);
const runAt = (now: string) =>
  prisma.$executeRawUnsafe(SQL.replace(/now\(\)/g, `'${now}'::timestamptz`));

describe('recurring events Paris wall-clock realignment against Postgres', () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  // `startsAt` is a zone-less timestamp holding UTC, so it is tagged UTC first:
  // a bare `AT TIME ZONE 'Europe/Paris'` would read it as Paris local time.
  const parisTime = async (id: string) => {
    const [row] = await prisma.$queryRaw<{ t: string }[]>`
      SELECT to_char(("startsAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris', 'HH24:MI') AS t
      FROM "Event" WHERE id = ${id}`;
    return row.t;
  };

  async function series(teamId: string, recurrenceId: string, starts: string[], createdAt: string) {
    const ids: string[] = [];
    for (const startsAt of starts) {
      const e = await prisma.event.create({
        data: {
          teamId,
          type: 'TRAINING',
          startsAt: new Date(startsAt),
          location: 'Salle',
          recurrenceId,
          createdAt: new Date(createdAt),
        },
      });
      ids.push(e.id);
    }
    return ids;
  }

  it('realigns on the creation-time Paris hour even when the earliest row is gone', async () => {
    const team = await createTeam((await createClub()).id);
    // 19:00 Paris in winter is 18:00 UTC. Created in January and stepped by
    // 7 x 24 h across the 2027-03-28 change, the later rows read 20:00. Every
    // row left is already past the change: the earliest one is a drifted anchor.
    const ids = await series(
      team.id,
      'rec-1',
      ['2027-04-08T18:00:00Z', '2027-04-15T18:00:00Z', '2027-04-22T18:00:00Z'],
      '2027-01-05T10:00:00Z',
    );
    expect(await parisTime(ids[0])).toBe('20:00');
    await runAt('2027-04-01T00:00:00Z');
    for (const id of ids) expect(await parisTime(id)).toBe('19:00');
  });

  it('leaves past rows and deliberate edits alone, resyncs the meeting override and reminder due date', async () => {
    const team = await createTeam((await createClub()).id);
    const [past, future, moved] = await series(
      team.id,
      'rec-2',
      [
        '2027-03-01T18:00:00Z',
        '2027-04-05T18:00:00Z',
        '2027-04-12T17:30:00Z',
        '2027-04-19T18:00:00Z',
      ],
      '2027-01-05T10:00:00Z',
    );
    await prisma.eventMeeting.create({
      data: { eventId: future, meetsAtOverride: new Date('2027-04-05T16:00:00Z') },
    });
    const share = await prisma.eventShare.create({
      data: {
        eventId: future,
        teamId: team.id,
        type: 'REMINDER',
        state: 'SCHEDULED',
        dueAt: new Date('2027-04-02T18:00:00Z'),
      },
    });

    await runAt('2027-03-15T00:00:00Z');

    expect(await parisTime(past)).toBe('19:00');
    expect(await parisTime(future)).toBe('19:00');
    expect(await parisTime(moved)).toBe('19:30');
    const meeting = await prisma.eventMeeting.findUniqueOrThrow({ where: { eventId: future } });
    expect(meeting.meetsAtOverride).toBeNull();
    const reminder = await prisma.eventShare.findUniqueOrThrow({ where: { id: share.id } });
    expect(reminder.dueAt?.toISOString()).toBe('2027-04-02T17:00:00.000Z');
  });

  it('never rewrites an event that already started', async () => {
    const team = await createTeam((await createClub()).id);
    const [first] = await series(
      team.id,
      'rec-3',
      ['2027-04-05T18:00:00Z', '2027-04-12T18:00:00Z'],
      '2027-01-05T10:00:00Z',
    );
    await runAt('2027-04-20T00:00:00Z');
    expect(await parisTime(first)).toBe('20:00');
  });
});
