import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.setGlobalPrefix('api/v1');
  app.use(helmet());

  const allowed =
    process.env.ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ??
    ['http://localhost:3100', 'http://localhost:8081', 'http://localhost:19006'];
  const isDev = process.env.NODE_ENV !== 'production';
  // In dev, also allow any localhost/LAN origin so phones on the same WiFi can test.
  const lanOriginRegex = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;
  app.enableCors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowed.includes(origin)) return cb(null, true);
      if (isDev && lanOriginRegex.test(origin)) return cb(null, true);
      return cb(new Error(`Origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // No-store on every auth path — prevent intermediary/browser caching of tokens.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/v1/auth/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
    }
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalInterceptors(new ResponseTransformInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  // Swagger only in non-prod — reveals full DTO + auth scheme to attackers otherwise.
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Smart Attendance API')
      .setDescription('Backend API for Smart Attendance (100 branches × 5000 employees)')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const doc = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, doc);
    Logger.log('Swagger exposed at /api/docs (non-prod)', 'Bootstrap');
  }

  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port);
  Logger.log(`API ready at http://localhost:${port}/api/v1`, 'Bootstrap');
}
bootstrap();
