import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import helmet from 'helmet';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { ResponseTransformInterceptor } from '../src/common/interceptors/response-transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

export type PrismaMock = Partial<Record<keyof PrismaService, any>>;

/**
 * Boots a Nest app with the real HTTP stack (pipes, guards, filters, interceptors)
 * but with PrismaService replaced by a caller-supplied mock. Mirrors main.ts
 * bootstrap so e2e coverage reflects production wiring.
 */
export async function buildTestApp(prismaMock: PrismaMock): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prismaMock)
    .compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
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
  await app.init();
  return app;
}
