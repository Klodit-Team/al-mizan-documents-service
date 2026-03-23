import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

describe('DocumentsController', () => {
  let controller: DocumentsController;

  const mockDocumentsService = {
    uploadDocument: jest.fn(),
    getDocumentById: jest.fn(),
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

  it('devrait être défini', () => {
    expect(controller).toBeDefined();
  });

  describe('GET :id — getDocumentById (DOC-02)', () => {
    it('devrait déléguer au service et retourner les métadonnées', async () => {
      const docId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const expected = { id: docId, nom: 'test.pdf', typeMime: 'application/pdf' };
      mockDocumentsService.getDocumentById.mockResolvedValue(expected);

      const result = await controller.getDocumentById(docId);
      expect(mockDocumentsService.getDocumentById).toHaveBeenCalledWith(docId);
      expect(result).toEqual(expected);
    });
  });

  describe('GET :id/download — URL présignée (DOC-08)', () => {
    it("devrait déléguer au service et retourner l'URL présignée", async () => {
      const docId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const expected = {
        url: 'https://minio/url',
        expiresAt: Math.floor(Date.now() / 1000) + 1800,
        ttlSeconds: 1800,
        fromCache: false,
      };
      mockDocumentsService.getPresignedUrl.mockResolvedValue(expected);

      const result = await controller.getPresignedDownloadUrl(docId);
      expect(mockDocumentsService.getPresignedUrl).toHaveBeenCalledWith(docId);
      expect(result).toEqual(expected);
    });
  });

  describe("GET :id/integrity — vérification d'intégrité (DOC-09)", () => {
    it("devrait déléguer au service et retourner le résultat d'intégrité", async () => {
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
