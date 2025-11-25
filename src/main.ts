import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ResponseInterceptor } from './common/response.interceptor';
import { HttpExceptionFilter } from './common/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Register response interceptor
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Register exception filter with i18n support (resolve service from app)
  const i18n = app.get('I18nService');
  if (i18n) {
    app.useGlobalFilters(new HttpExceptionFilter(i18n));
  }

  await app.listen(3000);
}

bootstrap();
