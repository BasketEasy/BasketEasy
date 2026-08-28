import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageService } from './storage.service';

jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

describe('StorageService', () => {
  let service: StorageService;

  const config: Record<string, string> = {
    R2_ACCOUNT_ID: 'acct-123',
    R2_BUCKET: 'basketeasy-scoresheets-test',
    R2_ACCESS_KEY_ID: 'key-id',
    R2_SECRET_ACCESS_KEY: 'secret',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    (getSignedUrl as jest.Mock).mockResolvedValue('https://signed.example/upload');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: ConfigService, useValue: { get: (key: string) => config[key] } },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
  });

  it('constructs the S3 client with region "auto" and the EU-jurisdiction R2 endpoint — no real network call', () => {
    expect(S3Client).toHaveBeenCalledWith({
      region: 'auto',
      endpoint: 'https://acct-123.eu.r2.cloudflarestorage.com',
      credentials: { accessKeyId: 'key-id', secretAccessKey: 'secret' },
    });
  });

  it('returns a presigned PUT URL scoped to the configured bucket/key/contentType with a 5-minute expiry', async () => {
    const url = await service.getUploadUrl('scoresheets/event-1/photo.jpg', 'image/jpeg');

    expect(url).toBe('https://signed.example/upload');
    expect(PutObjectCommand).toHaveBeenCalledWith({
      Bucket: 'basketeasy-scoresheets-test',
      Key: 'scoresheets/event-1/photo.jpg',
      ContentType: 'image/jpeg',
    });
    expect(getSignedUrl).toHaveBeenCalledWith(expect.any(S3Client), expect.any(PutObjectCommand), {
      expiresIn: 300,
    });
  });

  it('deletes an object by key, scoped to the configured bucket', async () => {
    const sendMock = jest.fn().mockResolvedValue(undefined);
    (S3Client as unknown as jest.Mock).mock.instances[0].send = sendMock;

    await service.deleteObject('scoresheets/event-1/old.jpg');

    expect(sendMock).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
    expect(DeleteObjectCommand).toHaveBeenCalledWith({
      Bucket: 'basketeasy-scoresheets-test',
      Key: 'scoresheets/event-1/old.jpg',
    });
  });
});
