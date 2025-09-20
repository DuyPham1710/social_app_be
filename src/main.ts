import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { validationPipe } from './config/validation.config';
import { setupSwagger } from './config/swagger.config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformResponseInterceptor } from './common/interceptors/respomse-transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global Filters
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global Interceptor
  app.useGlobalInterceptors(new TransformResponseInterceptor());
  // Global Validation Pipe
  app.useGlobalPipes(validationPipe);

  // Swagger
  setupSwagger(app);


  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
