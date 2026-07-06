import 'reflect-metadata';
import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { AllExceptionFilter } from './global/filter/all-exception.filter';
import { TransformInterceptor } from './global/interceptor/transform.interceptor';
import { TenantContextInterceptor } from './global/interceptor/tenant-context.interceptor';
import { LoggingInterceptor } from './global/interceptor/logging.interceptor';
import { runSeed } from './database/seed.runner';

async function bootstrap(): Promise<void> {
  // rawBody: preserve the exact request bytes so webhook HMAC (Shopify) can be
  // verified against the raw payload, not a re-stringified JSON copy.
  const app = await NestFactory.create(AppModule, { cors: true, rawBody: true });
  const config = app.get(ConfigService);
  const prefix = config.get<string>('API_PREFIX', 'api/v1');

  app.setGlobalPrefix(prefix);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );
  app.useGlobalFilters(new AllExceptionFilter());
  // Tenant context (outer) wraps the handler in AsyncLocalStorage; Transform wraps the
  // response; Logging (inner-most) records method/path/status/duration with no PII.
  app.useGlobalInterceptors(
    new TenantContextInterceptor(app.get(DataSource)),
    new TransformInterceptor(),
    new LoggingInterceptor(),
  );

  const swagger = new DocumentBuilder()
    .setTitle('IVY USA Chat & Support Widget API')
    .setDescription('CHATWIDGET — NestJS + MySQL. Follows Amoeba standards.')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(`${prefix}/docs`, app, SwaggerModule.createDocument(app, swagger));

  // Optional self-bootstrap for staging/managed envs (no ts-node in the image).
  if (config.get<string>('SEED_ON_BOOT') === 'true') {
    try {
      await runSeed(app.get(DataSource));
      new Logger('Bootstrap').log('SEED_ON_BOOT: seed applied.');
    } catch (e) {
      new Logger('Bootstrap').error(`SEED_ON_BOOT failed: ${(e as Error).message}`);
    }
  }

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  new Logger('Bootstrap').log(`API listening on http://localhost:${port}/${prefix}`);
}

void bootstrap();
