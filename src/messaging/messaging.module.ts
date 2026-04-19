import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DocumentEventPublisher } from './publishers/document-event.publisher';
import { OcrResultConsumer } from './consumers/ocr-result.consumer';
import { AmqpPublisherService } from './amqp-publisher.service';
import { UserDocsConsumer } from './consumers/user-docs.consumer';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'RABBITMQ_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [
              configService.get<string>(
                'RABBITMQ_URL',
                'amqp://localhost:5673',
              ),
            ],
            queue: 'documents.ocr.results',
            queueOptions: {
              durable: true,
            },
          },
        }),
      },
      {
        name: 'RABBITMQ_PUBLISHER',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [
              configService.get<string>(
                'RABBITMQ_URL',
                'amqp://localhost:5673',
              ),
            ],
            // Publisher-only client: send messages to the central topic exchange
            exchange: configService.get<string>('RABBITMQ_EXCHANGE', 'al-mizan.events'),
            exchangeType: 'topic',
          },
        }),
      },
    ]),
  ],
  controllers: [OcrResultConsumer, UserDocsConsumer],
  providers: [DocumentEventPublisher, AmqpPublisherService],
  exports: [DocumentEventPublisher], // Export pour être utilisable partout
})
export class MessagingModule {}
