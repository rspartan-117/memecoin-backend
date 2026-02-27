import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // rawBody: true registers express.json({ verify: rawBodyParser }) globally.
    // This gives ALL routes both req.body (parsed JSON) and req.rawBody (Buffer).
    // Do NOT manually add express.json() — it breaks this by polluting the
    // router stack so NestJS skips its own global registration.
    rawBody: true,
  });

  // ✅ Enable CORS for Swagger UI to work properly
  app.enableCors({
    origin: '*', // or specify exact domains instead of '*'
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  });

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('Meme Coin')
    .setDescription(
      'The following endpoints are available for the Meme Coin.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);
  // Swagger setup end

  // Add global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT || 4000);
}
bootstrap();
