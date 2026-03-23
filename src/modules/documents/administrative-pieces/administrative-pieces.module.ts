import { Module } from '@nestjs/common';
import { AdministrativePiecesController } from './administrative-pieces.controller';
import { AdministrativePiecesService } from './administrative-pieces.service';
import { MessagingModule } from '../../../messaging/messaging.module';

@Module({
  imports: [MessagingModule],
  controllers: [AdministrativePiecesController],
  providers: [AdministrativePiecesService],
})
export class AdministrativePiecesModule {}
