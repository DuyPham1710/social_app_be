import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { validationPipe } from './config/validation.config';
import { setupSwagger } from './config/swagger.config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformResponseInterceptor } from './common/interceptors/response-transform.interceptor';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Increase payload limit for large base64 requests (like face registration)
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // Global Filters
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global Interceptor
  app.useGlobalInterceptors(new TransformResponseInterceptor());
  // Global Validation Pipe
  app.useGlobalPipes(validationPipe);

  // Swagger
  setupSwagger(app);

  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
