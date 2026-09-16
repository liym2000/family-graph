import 'reflect-metadata';
import { json, urlencoded } from 'express';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { loadAppConfig } from './config';

async function bootstrap() {
  const config = loadAppConfig();
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '20mb' }));
  app.use(urlencoded({ extended: true, limit: '20mb' }));
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableCors({
    origin: config.corsOrigins,
    exposedHeaders: ['Content-Disposition'],
  });
  app.enableShutdownHooks();
  await app.listen(config.port, config.host);
}

bootstrap();
