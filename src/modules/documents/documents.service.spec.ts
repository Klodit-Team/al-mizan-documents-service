import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { CachingService } from '../../caching/caching.service';
import { DocumentEventPublisher } from '../../messaging/publishers/document-event.publisher';
import { NotFoundException } from '@nestjs/common';
import { Readable } from 'stream';
import { createHash } from 'crypto';

describe('DocumentsService', () => {
  let service: DocumentsService;

  const mockPrisma = {
    document: { findUnique: jest.fn() },
  };
  const mockStorage = {
    getPresignedUrl: jest.fn(),
    getObjectStream: jest.fn(),
  };
  const mockCache = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };
  const mockEventPublisher = {
    publishDocumentValidated: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
        { provide: CachingService, useValue: mockCache },
        { provide: DocumentEventPublisher, useValue: mockEventPublisher },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
    jest.clearAllMocks();
  });

  it('devrait être défini', () => {
    expect(service).toBeDefined();
  });

  describe('DOC-08 : getPresignedUrl', () => {
    it('devrait lever NotFoundException si le document est introuvable', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(null);
      await expect(service.getPresignedUrl('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it("devrait retourner l'URL depuis le cache Redis si elle existe (cache HIT)", async () => {
      mockPrisma.document.findUnique.mockResolvedValue({
        id: 'd1',
        fichierUrl: 'path/file.pdf',
      });
      mockCache.get.mockResolvedValue('https://minio/presigned-cached');

      const result = await service.getPresignedUrl('d1');

      expect(result.presignedUrl).toBe('https://minio/presigned-cached');
      expect(mockStorage.getPresignedUrl).not.toHaveBeenCalled();
      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('devrait générer une URL via MinIO et la mettre en cache (cache MISS)', async () => {
      mockPrisma.document.findUnique.mockResolvedValue({
        id: 'd1',
        fichierUrl: 'path/file.pdf',
      });
      mockCache.get.mockResolvedValue(null);
      mockStorage.getPresignedUrl.mockResolvedValue(
        'https://minio/presigned-new',
      );

      const result = await service.getPresignedUrl('d1');

      expect(mockStorage.getPresignedUrl).toHaveBeenCalledWith(
        'path/file.pdf',
        1800,
      );
      expect(mockCache.set).toHaveBeenCalledWith(
        'presignedUrl:d1',
        'https://minio/presigned-new',
        1800,
      );
      expect(result.presignedUrl).toBe('https://minio/presigned-new');
      expect(result.expiresAt).toBeDefined();
    });
  });

  describe('DOC-09 : checkIntegrity', () => {
    it('devrait lever NotFoundException si le document est introuvable', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(null);
      await expect(service.checkIntegrity('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('devrait retourner integrityOk: true si le hash SHA-256 correspond', async () => {
      const fakeContent = 'contenu-connu-du-fichier';
      const expectedHash = createHash('sha256')
        .update(fakeContent)
        .digest('hex');

      mockPrisma.document.findUnique.mockResolvedValue({
        id: 'd2',
        fichierUrl: 'path/file.pdf',
        hashSha256: expectedHash,
        ownerId: 'owner-1',
      });
      const fakeStream = Readable.from([Buffer.from(fakeContent)]);
      mockStorage.getObjectStream.mockResolvedValue(fakeStream);

      const result = await service.checkIntegrity('d2');

      expect(result.integrityOk).toBe(true);
      expect(result.documentId).toBe('d2');
      expect(
        mockEventPublisher.publishDocumentValidated,
      ).not.toHaveBeenCalled();
    });

    it('devrait retourner integrityOk: false et publier un événement si le hash est altéré', async () => {
      const fakeContent = 'contenu-altere';

      mockPrisma.document.findUnique.mockResolvedValue({
        id: 'd3',
        fichierUrl: 'path/file.pdf',
        hashSha256: 'hash-original-different',
        ownerId: 'owner-1',
      });
      const fakeStream = Readable.from([Buffer.from(fakeContent)]);
      mockStorage.getObjectStream.mockResolvedValue(fakeStream);

      const result = await service.checkIntegrity('d3');

      expect(result.integrityOk).toBe(false);
      expect(mockEventPublisher.publishDocumentValidated).toHaveBeenCalledWith(
        expect.objectContaining<{ isValid: boolean; validatedBy: string }>({
          isValid: false,
          validatedBy: 'SYSTEM',
        }),
      );
    });
  });
});
