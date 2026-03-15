import { Module } from '@nestjs/common';
import { PkiController } from './pki.controller';
import { PkiService } from './pki.service';

@Module({
  controllers: [PkiController],
  providers: [PkiService],
})
export class PkiModule {}
