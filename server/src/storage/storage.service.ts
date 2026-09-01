import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
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
      // Cloudflare namespaces the S3 API endpoint by jurisdiction for a
      // bucket created with a jurisdictional restriction — `.eu.` here,
      // not the plain `<account>.r2.cloudflarestorage.com` a
      // no-restriction bucket would use. This app's bucket is required to
      // have the EU restriction (RGPD: scoresheet photos are minors' data,
      // see the match interface spec's Storage section), so this is the
      // only endpoint shape this service ever needs to produce.
      endpoint: `https://${accountId}.eu.r2.cloudflarestorage.com`,
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

  // Deleting a key that doesn't exist is not an error for S3-compatible
  // APIs (including R2) — callers don't need to check existence first.
  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  // Server-side read for the OCR worker — no presigning needed since the
  // fetch happens in-process, not from a browser.
  async getObjectBuffer(key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await result.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }
}
