import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Long enough for a mobile upload over a gym's wifi, short enough not to
// leave a stale writable URL lying around.
const UPLOAD_URL_EXPIRY_SECONDS = 5 * 60;

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  // Unlike JWT_ACCESS_SECRET, these vars aren't validated at boot (AppModule's
  // ConfigModule.forRoot({ validate })) — until the Cloudflare R2 bucket/token
  // setup (a human, out-of-band step) is done, the server should still start
  // and serve every other route; only an actual scoresheet upload attempt
  // fails, not the whole app.
  constructor(config: ConfigService) {
    const accountId = config.get<string>('R2_ACCOUNT_ID')!;
    this.bucket = config.get<string>('R2_BUCKET')!;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.get<string>('R2_ACCESS_KEY_ID')!,
        secretAccessKey: config.get<string>('R2_SECRET_ACCESS_KEY')!,
      },
    });
  }

  async getUploadUrl(key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.client, command, { expiresIn: UPLOAD_URL_EXPIRY_SECONDS });
  }
}
