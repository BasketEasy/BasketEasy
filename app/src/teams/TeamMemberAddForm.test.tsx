import { beforeAll, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { TeamMemberAddForm } from './TeamMemberAddForm';

// jsdom implements neither the Pointer Events methods nor scrollIntoView
// that Radix's Select uses to manage its open/highlight behavior — without
// these no-op stubs, opening the Select throws in tests (works fine in a
// real browser).
beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

function mockClubMembers() {
  server.use(
    http.get('/api/clubs/club-1/members', () =>
      HttpResponse.json([
        { userId: 'user-1', email: 'a@b.com', role: 'ADMIN', joinedAt: 'x' },
        { userId: 'user-2', email: 'c@d.com', role: 'MEMBER', joinedAt: 'x' },
      ]),
    ),
  );
}

describe('TeamMemberAddForm', () => {
  it('excludes club members already on the team from the picker', async () => {
    mockClubMembers();
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/members', () =>
        HttpResponse.json([{ userId: 'user-2', email: 'c@d.com', addedAt: 'x' }]),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<TeamMemberAddForm clubId="club-1" teamId="team-1" />);

    await user.click(await screen.findByLabelText(/membre du club/i));

    expect(await screen.findByRole('option', { name: 'a@b.com' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'c@d.com' })).not.toBeInTheDocument();
  });

  it('adds the selected member, clears the field, and calls onSuccess', async () => {
    mockClubMembers();
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/members', () => HttpResponse.json([])),
      http.post('/api/clubs/club-1/teams/team-1/members', async ({ request }) => {
        const body = (await request.json()) as { userId: string };
        expect(body).toEqual({ userId: 'user-1' });
        return HttpResponse.json({ userId: 'user-1', email: 'a@b.com', addedAt: '2026-01-01' });
      }),
    );

    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <TeamMemberAddForm clubId="club-1" teamId="team-1" onSuccess={onSuccess} />,
    );

    await user.click(await screen.findByLabelText(/membre du club/i));
    await user.click(await screen.findByRole('option', { name: 'a@b.com' }));
    await user.click(screen.getByRole('button', { name: /ajouter à l'équipe/i }));

    await screen.findByRole('button', { name: /ajouter à l'équipe/i });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('shows a submit-level error on a server failure', async () => {
    mockClubMembers();
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/members', () => HttpResponse.json([])),
      http.post('/api/clubs/club-1/teams/team-1/members', () =>
        HttpResponse.json({ message: 'error' }, { status: 409 }),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<TeamMemberAddForm clubId="club-1" teamId="team-1" />);

    await user.click(await screen.findByLabelText(/membre du club/i));
    await user.click(await screen.findByRole('option', { name: 'a@b.com' }));
    await user.click(screen.getByRole('button', { name: /ajouter à l'équipe/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/déjà partie de l’équipe/i);
  });
});
