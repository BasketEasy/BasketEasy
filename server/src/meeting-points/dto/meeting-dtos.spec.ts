import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateClubMeetingSettingsDto } from './update-club-meeting-settings.dto';
import { UpdateTeamMeetingSettingsDto } from './update-team-meeting-settings.dto';
import { UpdateEventMeetingDto } from './update-event-meeting.dto';

async function errorsFor<T extends object>(cls: new () => T, body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, body), { whitelist: true });
  return errors.map((e) => e.property);
}

describe('meeting-point DTOs', () => {
  it('accepts an explicit null meeting point on club settings, rejects a missing one', async () => {
    await expect(
      errorsFor(UpdateClubMeetingSettingsDto, { meetingPoint: null, arrivalBufferMinutes: 45 }),
    ).resolves.toEqual([]);
    await expect(
      errorsFor(UpdateClubMeetingSettingsDto, { arrivalBufferMinutes: 45 }),
    ).resolves.toEqual(['meetingPoint']);
  });

  it('rejects a meeting point missing its address, and a buffer out of range', async () => {
    await expect(
      errorsFor(UpdateClubMeetingSettingsDto, {
        meetingPoint: { name: 'Parking' },
        arrivalBufferMinutes: 500,
      }),
    ).resolves.toEqual(['meetingPoint', 'arrivalBufferMinutes']);
  });

  it('lets a team inherit the buffer with null', async () => {
    await expect(
      errorsFor(UpdateTeamMeetingSettingsDto, { meetingPoint: null, arrivalBufferMinutes: null }),
    ).resolves.toEqual([]);
  });

  it('accepts null and absent fields on the per-match override', async () => {
    await expect(errorsFor(UpdateEventMeetingDto, {})).resolves.toEqual([]);
    await expect(
      errorsFor(UpdateEventMeetingDto, { meetingPoint: null, travelMinutes: null, meetsAt: null }),
    ).resolves.toEqual([]);
    await expect(
      errorsFor(UpdateEventMeetingDto, { travelMinutes: -1, meetsAt: 'demain' }),
    ).resolves.toEqual(['travelMinutes', 'meetsAt']);
  });
});
