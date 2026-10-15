import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePlayerDto } from './update-player.dto';

describe('UpdatePlayerDto', () => {
  it('passes with no fields (a partial update touching neither name)', async () => {
    const dto = plainToInstance(UpdatePlayerDto, {});
    expect(await validate(dto)).toHaveLength(0);
  });

  it('passes with a valid firstName only', async () => {
    const dto = plainToInstance(UpdatePlayerDto, { firstName: 'Alex' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects an explicit null firstName instead of silently passing it through', async () => {
    const dto = plainToInstance(UpdatePlayerDto, { firstName: null });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('firstName');
  });

  it('rejects an explicit null lastName instead of silently passing it through', async () => {
    const dto = plainToInstance(UpdatePlayerDto, { lastName: null });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('lastName');
  });

  it('rejects an empty firstName', async () => {
    const dto = plainToInstance(UpdatePlayerDto, { firstName: '' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('firstName');
  });

  it('passes with a valid userId', async () => {
    const dto = plainToInstance(UpdatePlayerDto, {
      userId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('passes with an explicit null userId (unlink)', async () => {
    const dto = plainToInstance(UpdatePlayerDto, { userId: null });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a userId that is not a UUID', async () => {
    const dto = plainToInstance(UpdatePlayerDto, { userId: 'not-a-uuid' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('userId');
  });
});
