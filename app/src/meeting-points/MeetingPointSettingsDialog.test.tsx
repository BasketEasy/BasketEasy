import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MeetingPointSettingsDialog,
  type InheritedMeetingSettings,
  type MeetingPointSettingsValue,
} from './MeetingPointSettingsDialog';

const clubPlace = { name: 'Parking club', address: '1 rue du Club, Nantes' };

function renderDialog({
  value = { meetingPoint: null, arrivalBufferMinutes: 45 },
  inherited,
  onSubmit = vi.fn().mockResolvedValue(undefined),
}: {
  value?: MeetingPointSettingsValue;
  inherited?: InheritedMeetingSettings;
  onSubmit?: ReturnType<typeof vi.fn>;
} = {}) {
  render(
    <MeetingPointSettingsDialog
      open
      onOpenChange={vi.fn()}
      title="Point de rendez-vous"
      value={value}
      inherited={inherited}
      onSubmit={onSubmit}
    />,
  );
  return { onSubmit };
}

describe('MeetingPointSettingsDialog', () => {
  describe('club scope', () => {
    it('saves a trimmed place and the buffer as a number', async () => {
      const { onSubmit } = renderDialog();

      await userEvent.type(screen.getByLabelText('Nom du lieu'), '  Parking Coubertin ');
      await userEvent.type(screen.getByLabelText('Adresse'), ' 12 rue X ');
      const buffer = screen.getByLabelText('Arrivée à la salle avant le match');
      await userEvent.clear(buffer);
      await userEvent.type(buffer, '60');
      await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith({
          meetingPoint: { name: 'Parking Coubertin', address: '12 rue X' },
          arrivalBufferMinutes: 60,
        }),
      );
    });

    it('lets the club leave both fields empty, meaning no meeting point', async () => {
      const { onSubmit } = renderDialog();

      await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith({ meetingPoint: null, arrivalBufferMinutes: 45 }),
      );
    });

    it('refuses a half-filled place', async () => {
      const { onSubmit } = renderDialog();

      await userEvent.type(screen.getByLabelText('Nom du lieu'), 'Parking');
      await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

      expect(await screen.findByText('Renseignez le nom et l’adresse')).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('refuses a buffer out of range', async () => {
      const { onSubmit } = renderDialog();

      const buffer = screen.getByLabelText('Arrivée à la salle avant le match');
      await userEvent.clear(buffer);
      await userEvent.type(buffer, '-5');
      await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

      expect(await screen.findByText(/Entre 0 et \d+ minutes/)).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('offers « Supprimer le RDV » only when a place exists, keeping the buffer', async () => {
      const { onSubmit } = renderDialog({
        value: { meetingPoint: clubPlace, arrivalBufferMinutes: 30 },
      });

      await userEvent.click(screen.getByRole('button', { name: 'Supprimer le RDV' }));

      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith({ meetingPoint: null, arrivalBufferMinutes: 30 }),
      );
    });

    it('has no « Supprimer le RDV » without a place', () => {
      renderDialog();

      expect(screen.queryByRole('button', { name: 'Supprimer le RDV' })).not.toBeInTheDocument();
    });

    it('keeps a server error in the open dialog', async () => {
      const onSubmit = vi.fn().mockRejectedValue(new Error('boom'));
      renderDialog({ onSubmit });

      await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('team scope', () => {
    const inherited = { meetingPoint: clubPlace, arrivalBufferMinutes: 45 };

    it('sends nulls for the values it inherits', async () => {
      const { onSubmit } = renderDialog({
        value: { meetingPoint: null, arrivalBufferMinutes: null },
        inherited,
      });

      expect(screen.getByText(`${clubPlace.name} · ${clubPlace.address}`)).toBeInTheDocument();
      expect(screen.queryByLabelText('Nom du lieu')).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith({ meetingPoint: null, arrivalBufferMinutes: null }),
      );
    });

    it('requires a place once the team chooses its own', async () => {
      const { onSubmit } = renderDialog({
        value: { meetingPoint: null, arrivalBufferMinutes: null },
        inherited,
      });

      await userEvent.click(screen.getByRole('radio', { name: /Un lieu propre à l’équipe/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

      expect(await screen.findAllByText('Renseignez le nom et l’adresse')).toHaveLength(2);
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('sends the team’s own place and buffer', async () => {
      const { onSubmit } = renderDialog({
        value: { meetingPoint: { name: 'Gymnase', address: '2 rue Y' }, arrivalBufferMinutes: 30 },
        inherited,
      });

      // Own values open on « propre à l'équipe », fields shown and pre-filled.
      expect(screen.getByLabelText('Nom du lieu')).toHaveValue('Gymnase');
      expect(screen.getByLabelText('Minutes avant le match')).toHaveValue(30);
      await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith({
          meetingPoint: { name: 'Gymnase', address: '2 rue Y' },
          arrivalBufferMinutes: 30,
        }),
      );
    });

    it('never offers « Supprimer le RDV »', () => {
      renderDialog({
        value: { meetingPoint: { name: 'Gymnase', address: '2 rue Y' }, arrivalBufferMinutes: 30 },
        inherited,
      });

      expect(screen.queryByRole('button', { name: 'Supprimer le RDV' })).not.toBeInTheDocument();
    });
  });
});
