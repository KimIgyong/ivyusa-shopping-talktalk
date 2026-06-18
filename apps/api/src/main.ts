import 'reflect-metadata';
import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionFilter } from './global/filter/all-exception.filter';
import { TransformInterceptor } from './global/interceptor/transform.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { cors: true });
  const config = app.get(ConfigService);
  const prefix = config.get<string>('API_PREFIX', 'api/v1');

  app.setGlobalPrefix(prefix);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );
  app.useGlobalFilters(new AllExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  const swagger = new DocumentBuilder()
    .setTitle('IVY USA Chat & Support Widget API')
    .setDescription('CHATWIDGET — NestJS + MySQL. Follows Amoeba standards.')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(`${prefix}/docs`, app, SwaggerModule.createDocument(app, swagger));

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  new Logger('Bootstrap').log(`API listening on http://localhost:${port}/${prefix}`);
}

void bootstrap();
