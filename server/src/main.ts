import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser = require('cookie-parser');
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    // FRONTEND_URL: kluvo.net (Cloudflare Workers, prod) is a different
    // origin from api.kluvo.net (API, Scaleway), so this can't be
    // same-origin-only.
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true, // required for the refresh cookie to be sent cross-site
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    // X-Platform-Token carries the back-office step-up credential. It is a
    // second header rather than a second Authorization value because both
    // credentials are required together on every /admin/* request — and a
    // header the browser is not allowed to send is a CORS preflight failure
    // with no visible cause.
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Platform-Token'],
  });
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Kluvo API listening on port ${port}`);
}

bootstrap();
