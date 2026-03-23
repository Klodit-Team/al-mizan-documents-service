import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DocumentEventPublisher } from './publishers/document-event.publisher';
import { OcrResultConsumer } from './consumers/ocr-result.consumer';

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
                'amqp://localhost:5672',
              ),
            ],
            queue: 'documents.ocr.results',
            queueOptions: {
              durable: true,
            },
          },
        }),
      },
    ]),
  ],
  controllers: [OcrResultConsumer],
  providers: [DocumentEventPublisher],
  exports: [DocumentEventPublisher], // Export pour être utilisable partout
})
export class MessagingModule {}
