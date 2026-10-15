import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BrevoClient } from './brevo-client';

type BrevoPayload = {
  sender: { email: string; name: string };
  replyTo: { email: string; name: string };
  to: { email: string }[];
  subject: string;
};

describe('BrevoClient', () => {
  let client: BrevoClient;
  let env: Record<string, string | undefined>;
  let fetchMock: jest.Mock;

  const message = {
    to: 'theo.dupont@example.fr',
    subject: 'Vous êtes convoqué·e',
    html: '<p>Match contre ASVEL</p>',
    text: 'Match contre ASVEL',
  };

  function sentPayload(): BrevoPayload {
    return JSON.parse(fetchMock.mock.calls[0][1].body as string) as BrevoPayload;
  }

  beforeEach(async () => {
    env = { BREVO_API_KEY: 'brevo-key' };
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 201 });
    global.fetch = fetchMock as unknown as typeof fetch;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrevoClient,
        { provide: ConfigService, useValue: { get: jest.fn((key: string) => env[key]) } },
      ],
    }).compile();

    client = module.get<BrevoClient>(BrevoClient);
  });

  it('sends from no-reply but points replies at the monitored mailbox', async () => {
    await client.send(message);

    const payload = sentPayload();
    // A transactional message is not an invitation to reply, so From is
    // no-reply — but a reply that bounces is worse than none, so Reply-To
    // has to reach a human.
    expect(payload.sender.email).toBe('no-reply@kluvo.net');
    expect(payload.replyTo.email).toBe('contact@kluvo.net');
  });

  it('lets both addresses be overridden independently', async () => {
    env.MAIL_FROM_EMAIL = 'noreply@asc-nantes.fr';
    env.MAIL_REPLY_TO_EMAIL = 'bureau@asc-nantes.fr';

    await client.send(message);

    const payload = sentPayload();
    expect(payload.sender.email).toBe('noreply@asc-nantes.fr');
    expect(payload.replyTo.email).toBe('bureau@asc-nantes.fr');
  });

  it('gives the reply address the same display name as the sender', async () => {
    env.MAIL_FROM_NAME = 'Kluvo · ASC Nantes';

    await client.send(message);

    const payload = sentPayload();
    // Mail clients show this name in the compose window; a reply that reads
    // as going somewhere other than where it appears to is confusing.
    expect(payload.replyTo.name).toBe(payload.sender.name);
    expect(payload.replyTo.name).toBe('Kluvo · ASC Nantes');
  });

  it('authenticates with the api-key header and addresses the recipient', async () => {
    await client.send(message);

    const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string> };
    expect(init.headers['api-key']).toBe('brevo-key');
    expect(sentPayload().to).toEqual([{ email: 'theo.dupont@example.fr' }]);
  });

  it('throws with the provider body, which is the only place a bad sender domain is explained', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('{"code":"invalid_parameter","message":"sender not valid"}'),
    });

    await expect(client.send(message)).rejects.toThrow(/sender not valid/);
  });

  it('fails loudly if the API key vanished from the environment', async () => {
    delete env.BREVO_API_KEY;

    // MailModule only binds this client when the key is set, so this means
    // the env changed under a running process — never a silent no-op.
    await expect(client.send(message)).rejects.toThrow(/BREVO_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
