import { Test, TestingModule } from '@nestjs/testing';
import { OcrResultConsumer, OcrResultDto } from './ocr-result.consumer';
import { PrismaService } from '../../prisma/prisma.service';
import { TypeAnalyse } from '@prisma/client';
import { Logger } from '@nestjs/common';

describe('OcrResultConsumer', () => {
  let consumer: OcrResultConsumer;

  const mockPrismaService = {
    ocrAnalyse: {
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OcrResultConsumer],
      providers: [
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    consumer = module.get<OcrResultConsumer>(OcrResultConsumer);

    // Silence logger during tests pour garder la console propre
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    jest.clearAllMocks();
  });

  it('devrait être défini', () => {
    expect(consumer).toBeDefined();
  });

  describe('handleOcrResult', () => {
    it('devrait insérer une analyse OCR conforme en base de données', async () => {
      const payload: OcrResultDto = {
        documentId: 'doc-id-1',
        typeAnalyse: TypeAnalyse.OCR,
        scoreConfiance: 0.95,
        texteExtrait: 'Ceci est un document',
        isConforme: true,
      };

      await consumer.handleOcrResult(payload);

      expect(mockPrismaService.ocrAnalyse.create).toHaveBeenCalledWith({
        data: {
          documentId: payload.documentId,
          pieceId: undefined, // Testons que le undefind reste passif
          typeAnalyse: payload.typeAnalyse,
          texteExtrait: payload.texteExtrait,
          scoreConfiance: payload.scoreConfiance,
          isConforme: payload.isConforme,
          anomalies: [],
        },
      });
    });

    it('devrait ne pas planter en cas dérreur base de données (sécurité du consumer RabbitMQ)', async () => {
      const payload: OcrResultDto = {
        documentId: 'doc-id-err',
        typeAnalyse: TypeAnalyse.OCR,
      };

      mockPrismaService.ocrAnalyse.create.mockRejectedValueOnce(
        new Error('Erreur bdd temporaire'),
      );

      // Il ne doit pas throw l'erreur au dessus (car on la catch() dans le try pour ne pas crasher le microservice)
      await expect(consumer.handleOcrResult(payload)).resolves.not.toThrow();
    });
  });
});
