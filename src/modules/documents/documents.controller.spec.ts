import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

describe('DocumentsController', () => {
  let controller: DocumentsController;

  const mockDocumentsService = {
    getPresignedUrl: jest.fn(),
    checkIntegrity: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentsController],
      providers: [
        {
          provide: DocumentsService,
          useValue: mockDocumentsService,
        },
      ],
    }).compile();

    controller = module.get<DocumentsController>(DocumentsController);
    jest.clearAllMocks();
  });

  it('devrait Ãªtre dÃ©fini', () => {
    expect(controller).toBeDefined();
  });

  describe('download (DOC-08)', () => {
    it("devrait dÃ©lÃ©guer au service et retourner l'URL prÃ©signÃ©e", async () => {
      const docId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const expected = {
        presignedUrl: 'https://minio/url',
        expiresAt: new Date().toISOString(),
      };
      mockDocumentsService.getPresignedUrl.mockResolvedValue(expected);

      const result = await controller.download(docId);

      expect(mockDocumentsService.getPresignedUrl).toHaveBeenCalledWith(docId);
      expect(result).toEqual(expected);
    });
  });

  describe('integrity (DOC-09)', () => {
    it("devrait dÃ©lÃ©guer au service et retourner le rÃ©sultat d'intÃ©gritÃ©", async () => {
      const docId = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
      const expected = {
        documentId: docId,
        integrityOk: true,
        checkedAt: new Date().toISOString(),
      };
      mockDocumentsService.checkIntegrity.mockResolvedValue(expected);

      const result = await controller.integrity(docId);

      expect(mockDocumentsService.checkIntegrity).toHaveBeenCalledWith(docId);
      expect(result).toEqual(expected);
    });
  });
});
