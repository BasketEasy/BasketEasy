import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { TeamEvent } from '@basketeasy/types/events';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { EventEditModal } from './EventEditModal';

const trainingEvent: TeamEvent = {
  id: 'event-1',
  teamId: 'team-1',
  type: 'TRAINING',
  startsAt: '2026-01-05T18:00:00.000Z',
  location: 'Gymnase A',
  notes: null,
  opponentName: null,
  venue: null,
  recurrenceId: null,
  createdAt: 'x',
  myRsvpStatus: null,
  myRsvpRespondedBy: null,
  myRsvpRespondedAt: null,
  isImported: false,
  timeConfirmed: true,
  myConvocation: false,
  rsvpSummary: {
    rosterSize: 0,
    convoked: 0,
    answering: 0,
    going: 0,
    maybe: 0,
    notGoing: 0,
    pending: 0,
    isConvocationScoped: false,
  },
  logistics: { jerseys: null, balls: null },
  result: null,
  myMatchStats: null,
  meetingPlan: null,
  whatsAppShare: null,
  whatsAppSettings: null,
  myTravelMode: null,
};

const recurringEvent: TeamEvent = {
  ...trainingEvent,
  id: 'event-3',
  recurrenceId: 'series-1',
};

function EventEditModalHarness({ event }: { event: TeamEvent }) {
  const [open, setOpen] = useState(false);
  return (
    <EventEditModal
      clubId="club-1"
      teamId="team-1"
      event={event}
      open={open}
      onOpenChange={setOpen}
    />
  );
}

function renderModal(event: TeamEvent) {
  return renderWithProviders(<EventEditModalHarness event={event} />);
}

describe('EventEditModal', () => {
  it('shows the pre-filled form when opened', async () => {
    const user = userEvent.setup();
    renderModal(trainingEvent);

    await user.click(screen.getByRole('button', { name: /^modifier$/i }));

    expect(
      await screen.findByRole('heading', { name: /modifier l.événement/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/date et heure/i)).toHaveValue('2026-01-05T18:00');
    expect(screen.getByLabelText(/^lieu$/i)).toHaveValue('Gymnase A');
    expect(screen.queryByText('Appliquer à')).not.toBeInTheDocument();
  });

  it('edits startsAt on a non-recurring event and closes on success', async () => {
    let capturedBody: unknown;
    server.use(
      http.patch('/api/clubs/club-1/teams/team-1/events/event-1', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json([{ ...trainingEvent, location: 'Gymnase B' }]);
      }),
    );

    const user = userEvent.setup();
    renderModal(trainingEvent);

    await user.click(screen.getByRole('button', { name: /^modifier$/i }));
    await user.clear(screen.getByLabelText(/date et heure/i));
    await user.type(screen.getByLabelText(/date et heure/i), '2026-02-10T19:30');
    await user.clear(screen.getByLabelText(/^lieu$/i));
    await user.type(screen.getByLabelText(/^lieu$/i), 'Gymnase B');
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(capturedBody).toBeDefined());
    expect(capturedBody).toMatchObject({
      type: 'TRAINING',
      location: 'Gymnase B',
      scope: 'THIS',
      startsAt: '2026-02-10T19:30:00.000Z',
    });

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: /modifier l.événement/i }),
      ).not.toBeInTheDocument(),
    );
  });

  it('blocks submit when type is switched to MATCH without an opponent name', async () => {
    const user = userEvent.setup();
    renderModal(trainingEvent);

    await user.click(screen.getByRole('button', { name: /^modifier$/i }));
    await user.click(screen.getByRole('combobox', { name: /^type$/i }));
    await user.click(await screen.findByRole('option', { name: /^match$/i }));
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    expect(await screen.findByText(/nom de l'adversaire requis/i)).toBeInTheDocument();
  });

  it('recurring event: swaps to a time field for THIS_AND_FUTURE and submits both PATCH requests', async () => {
    let regularBody: unknown;
    let timeBody: unknown;
    server.use(
      http.patch('/api/clubs/club-1/teams/team-1/events/event-3', async ({ request }) => {
        regularBody = await request.json();
        return HttpResponse.json([{ ...recurringEvent, location: 'Gymnase B' }]);
      }),
      http.patch('/api/clubs/club-1/teams/team-1/events/event-3/time', async ({ request }) => {
        timeBody = await request.json();
        return HttpResponse.json([{ ...recurringEvent, location: 'Gymnase B' }]);
      }),
    );

    const user = userEvent.setup();
    renderModal(recurringEvent);

    await user.click(screen.getByRole('button', { name: /^modifier$/i }));
    await user.click(screen.getByRole('combobox', { name: /appliquer à/i }));
    await user.click(await screen.findByRole('option', { name: /cet événement et les suivants/i }));

    // The datetime-local field is swapped for a time-only field.
    expect(screen.queryByLabelText(/date et heure/i)).not.toBeInTheDocument();
    const timeInput = screen.getByLabelText(/^heure$/i);
    expect(timeInput).toHaveValue('18:00');

    await user.clear(timeInput);
    await user.type(timeInput, '20:15');
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(regularBody).toBeDefined());
    expect(regularBody).toMatchObject({ type: 'TRAINING', scope: 'THIS_AND_FUTURE' });
    expect(regularBody).not.toHaveProperty('startsAt');

    await waitFor(() => expect(timeBody).toBeDefined());
    expect(timeBody).toMatchObject({ scope: 'THIS_AND_FUTURE', hour: 20, minute: 15 });
  });

  describe('WhatsApp reminder field', () => {
    const settings = {
      reminderTemplate: null,
      reminderEnabled: true,
      defaultOffsetMinutes: 4320,
      hasReachableManager: true,
    };
    const withSettings = (over: Partial<NonNullable<TeamEvent['whatsAppSettings']>> = {}) => ({
      ...trainingEvent,
      whatsAppSettings: {
        override: null,
        offsetMinutes: null,
        effective: { enabled: true, offsetMinutes: 4320 },
        ...over,
      },
    });

    function servePatch() {
      const bodies: Record<string, unknown>[] = [];
      server.use(
        http.get('/api/clubs/club-1/teams/team-1/whatsapp-settings', () =>
          HttpResponse.json(settings),
        ),
        http.patch('/api/clubs/club-1/teams/team-1/events/event-1', async ({ request }) => {
          bodies.push((await request.json()) as Record<string, unknown>);
          return HttpResponse.json([trainingEvent]);
        }),
      );
      return bodies;
    }

    it('names what « Comme l’équipe » means for this team', async () => {
      servePatch();
      const user = userEvent.setup();
      renderModal(withSettings());

      await user.click(screen.getByRole('button', { name: /^modifier$/i }));

      expect(await screen.findByRole('combobox', { name: 'Rappel WhatsApp' })).toHaveTextContent(
        "Comme l'équipe (activé, 3 jours avant)",
      );
    });

    it('starts from the event’s own override and offset', async () => {
      servePatch();
      const user = userEvent.setup();
      renderModal(withSettings({ override: true, offsetMinutes: 120 }));

      await user.click(screen.getByRole('button', { name: /^modifier$/i }));

      expect(screen.getByRole('combobox', { name: 'Rappel WhatsApp' })).toHaveTextContent('Activé');
      expect(screen.getByLabelText('Me rappeler')).toHaveValue('2');
      expect(screen.getByRole('combobox', { name: 'Unité de durée' })).toHaveTextContent('heures');
    });

    it('sends nothing about the reminder when the field was not touched', async () => {
      const bodies = servePatch();
      const user = userEvent.setup();
      renderModal(withSettings({ override: true, offsetMinutes: 120 }));

      await user.click(screen.getByRole('button', { name: /^modifier$/i }));
      await user.click(screen.getByRole('button', { name: /enregistrer/i }));

      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0]).not.toHaveProperty('waReminderOverride');
      expect(bodies[0]).not.toHaveProperty('waOffsetMinutes');
    });

    it('sends the override and the offset in minutes once touched, null meaning inherit', async () => {
      const bodies = servePatch();
      const user = userEvent.setup();
      renderModal(withSettings({ override: true, offsetMinutes: 120 }));

      await user.click(screen.getByRole('button', { name: /^modifier$/i }));
      await user.click(screen.getByRole('combobox', { name: 'Rappel WhatsApp' }));
      await user.click(await screen.findByRole('option', { name: /Comme l'équipe/ }));
      await user.click(screen.getByRole('button', { name: /enregistrer/i }));

      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0]).toMatchObject({ waReminderOverride: null });
    });

    it('refuses an offset beyond 14 days', async () => {
      const bodies = servePatch();
      const user = userEvent.setup();
      renderModal(withSettings({ override: true, offsetMinutes: 120 }));

      await user.click(screen.getByRole('button', { name: /^modifier$/i }));
      const offset = screen.getByLabelText('Me rappeler');
      await user.clear(offset);
      await user.type(offset, '3');
      await user.click(screen.getByRole('combobox', { name: 'Unité de durée' }));
      await user.click(await screen.findByRole('option', { name: 'jours' }));
      await user.clear(offset);
      await user.type(offset, '20');
      await user.click(screen.getByRole('button', { name: /enregistrer/i }));

      expect(await screen.findByText('14 jours avant au maximum')).toBeInTheDocument();
      expect(bodies).toHaveLength(0);
    });
  });
});
