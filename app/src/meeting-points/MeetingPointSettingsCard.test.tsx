import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MeetingPointSettingsCard,
  type MeetingPointSettingsSummary,
} from './MeetingPointSettingsCard';

const place = { name: 'Parking Coubertin', address: '12 rue X, Nantes' };

function renderCard(
  props: Partial<Parameters<typeof MeetingPointSettingsCard>[0]> & {
    summary?: MeetingPointSettingsSummary;
  } = {},
) {
  const onRetry = vi.fn();
  const onEdit = vi.fn();
  render(
    <MeetingPointSettingsCard
      scope="club"
      isError={false}
      isLoading={false}
      onRetry={onRetry}
      onEdit={onEdit}
      summary={{ meetingPoint: place, arrivalBufferMinutes: 45 }}
      {...props}
    />,
  );
  return { onRetry, onEdit };
}

describe('MeetingPointSettingsCard', () => {
  it('shows a retry on error, never the empty placeholder', async () => {
    const { onRetry } = renderCard({ isError: true, summary: undefined });

    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(onRetry).toHaveBeenCalled();
    expect(screen.queryByText('Aucun point de rendez-vous')).not.toBeInTheDocument();
  });

  it('prefers the error over a stale summary', () => {
    renderCard({ isError: true });

    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(screen.queryByText(place.name)).not.toBeInTheDocument();
  });

  it('draws a skeleton while loading, with no edit button', () => {
    renderCard({ isLoading: true, summary: undefined });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('Aucun point de rendez-vous')).not.toBeInTheDocument();
  });

  it('says what happens without a meeting point, and offers « Définir »', async () => {
    const { onEdit } = renderCard({
      summary: { meetingPoint: null, arrivalBufferMinutes: 30 },
    });

    expect(screen.getByText('Aucun point de rendez-vous')).toBeInTheDocument();
    expect(
      screen.getByText('Les joueurs vont directement à la salle, 30 min avant le match.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Définir' }));
    expect(onEdit).toHaveBeenCalled();
  });

  it('shows the place, the buffer and the club caption, without source badges', async () => {
    const { onEdit } = renderCard();

    expect(screen.getByText(place.name)).toBeInTheDocument();
    expect(screen.getByText(place.address)).toBeInTheDocument();
    expect(screen.getByText('Arrivée à la salle 45 min avant le match')).toBeInTheDocument();
    expect(screen.getByText(/S’applique à toutes les équipes du club/)).toBeInTheDocument();
    expect(screen.queryByText('du club')).not.toBeInTheDocument();
    expect(screen.queryByText('propre à l’équipe')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Modifier' }));
    expect(onEdit).toHaveBeenCalled();
  });

  it('marks where each value comes from in team scope', () => {
    renderCard({
      scope: 'team',
      summary: {
        meetingPoint: place,
        arrivalBufferMinutes: 60,
        inheritsPlace: true,
        inheritsBuffer: false,
      },
    });

    expect(screen.getByText('du club')).toBeInTheDocument();
    expect(screen.getByText('propre à l’équipe')).toBeInTheDocument();
    expect(screen.getByText(/Vaut pour tous les matchs de l’équipe/)).toBeInTheDocument();
  });
});
