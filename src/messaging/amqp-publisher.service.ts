import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';

@Injectable()
export class AmqpPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AmqpPublisherService.name);
  private connection?: amqp.Connection;
  private channel?: amqp.Channel;

  private getExchange(): string {
    return process.env.RABBITMQ_EXCHANGE || 'al-mizan.events';
  }

  async onModuleInit() {
    const url = process.env.RABBITMQ_URL || 'amqp://localhost:5673';
    try {
      this.connection = await amqp.connect(url);
      this.channel = await this.connection.createChannel();
      const exchange = this.getExchange();
      await this.channel.assertExchange(exchange, 'topic', { durable: true });
      this.logger.log(`AMQP publisher connected and exchange asserted: ${exchange}`);
    } catch (err) {
      this.logger.error('Failed to initialize AMQP publisher', (err as Error).message);
      this.logger.warn('Continuing without AMQP publisher (degraded mode)');
    }
  }

  async publish(routingKey: string, payload: any) {
    if (!this.channel) {
      this.logger.warn(`AMQP channel unavailable. Skipping publish for ${routingKey}`);
      return false;
    }

    const exchange = this.getExchange();
    const buffer = Buffer.from(JSON.stringify(payload));
    const ok = this.channel.publish(exchange, routingKey, buffer, {
      persistent: true,
      contentType: 'application/json',
    });

    if (!ok) {
      this.logger.warn(`Channel returned false while publishing ${routingKey}`);
    }
    this.logger.log(`Published ${routingKey} to exchange ${exchange}`);
    return ok;
  }

  async onModuleDestroy() {
    try {
      await this.channel?.close();
      await this.connection?.close();
    } catch (err) {
      this.logger.warn('Error while closing AMQP publisher connection');
    }
  }
}
