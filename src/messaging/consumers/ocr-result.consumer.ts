import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { PrismaService } from '../../prisma/prisma.service';
import { TypeAnalyse, Prisma } from '@prisma/client';

export interface OcrResultDto {
  documentId: string;
  pieceId?: string;
  typeAnalyse: TypeAnalyse;
  texteExtrait?: string;
  scoreConfiance?: number;
  isConforme?: boolean;
  anomalies?: Prisma.InputJsonValue;
}

@Controller()
export class OcrResultConsumer {
  private readonly logger = new Logger(OcrResultConsumer.name);

  constructor(private readonly prisma: PrismaService) {}

  @EventPattern('documents.ocr.results')
  async handleOcrResult(@Payload() data: OcrResultDto) {
    this.logger.log(`Received OCR results for document ${data.documentId}`);

    try {
      await this.prisma.ocrAnalyse.create({
        data: {
          documentId: data.documentId,
          pieceId: data.pieceId,
          typeAnalyse: data.typeAnalyse,
          texteExtrait: data.texteExtrait,
          scoreConfiance: data.scoreConfiance,
          isConforme: data.isConforme,
          anomalies: data.anomalies !== undefined ? data.anomalies : [],
        },
      });

      this.logger.log(
        `Successfully saved OCR analysis for doc ${data.documentId}`,
      );
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(
          `Error saving OCR result: ${error.message}`,
          error.stack,
        );
      } else {
        this.logger.error(`An unknown error occurred while saving OCR result`);
      }
    }
  }
}
