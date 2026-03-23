import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Sécurité base: Helmet & CORS
  app.use(helmet());
  app.enableCors();

  // Rate Limiting : 100 requêtes / 15 minutes par IP par défaut
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
    }),
  );

  // Global Prefix
  app.setGlobalPrefix('api/v1');

  // Validation Globale (class-validator)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger (OpenAPI 3.0)
  const config = new DocumentBuilder()
    .setTitle('Al-Mizan - Document Service')
    .setDescription(
      "Microservice de gestion documentaire, d'intégrité (hash SHA-256), de PKI et pipeline OCR/NLP.",
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 8005;

  // Configuration du microservice RabbitMQ pour consommer les événements (Consumer)
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
      queue: 'documents.ocr.results',
      queueOptions: {
        durable: true,
      },
    },
  });

  await app.startAllMicroservices();
  await app.listen(port);
  console.log(
    `🚀 Document Service is running on: http://localhost:${port}/api/v1`,
  );
  console.log(
    `📚 Swagger docs available at: http://localhost:${port}/api/docs`,
  );
}
bootstrap().catch((err) => console.error(err));
