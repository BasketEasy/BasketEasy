import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser = require('cookie-parser');
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    // FRONTEND_URL: basketeasy.pages.dev (prod) is a different site from
    // basketeasy.onrender.com (API), so this can't be same-origin-only.
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true, // required for the refresh cookie to be sent cross-site
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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
  console.log(`BasketEasy API listening on port ${port}`);
}

bootstrap();
