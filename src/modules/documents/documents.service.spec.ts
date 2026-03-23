import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { CachingService } from '../../caching/caching.service';
import { DocumentEventPublisher } from '../../messaging/publishers/document-event.publisher';
import {
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Readable } from 'stream';
import { createHash } from 'crypto';

describe('DocumentsService', () => {
  let service: DocumentsService;

  const mockPrisma = {
    document: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockStorage = {
    uploadBuffer: jest.fn(),
    deleteObject: jest.fn(),
    generatePresignedUrl: jest.fn(),
    getObjectStream: jest.fn(),
    getPresignedUrl: jest.fn(),
  };

  const mockCache = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const mockEventPublisher = {
    publishDocumentValidated: jest.fn(),
  };

  // Mock Redis client (custom token REDIS_CLIENT)
  const mockRedisClient = {
    get: jest.fn(),
    setex: jest.fn(),
    ttl: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
        { provide: CachingService, useValue: mockCache },
        { provide: DocumentEventPublisher, useValue: mockEventPublisher },
        { provide: 'REDIS_CLIENT', useValue: mockRedisClient },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
    jest.clearAllMocks();
  });

  it('devrait être défini', () => {
    expect(service).toBeDefined();
  });

  // ─────────────────────────────────────────────────────────────
  // DOC-01 : uploadDocument
  // ─────────────────────────────────────────────────────────────
  describe('DOC-01 : uploadDocument', () => {
    const file = {
      originalname: 'test.pdf',
      mimetype: 'application/pdf',
      size: 1024,
      buffer: Buffer.from('test content'),
    } as Express.Multer.File;

    const dto = { ownerId: 'owner-uuid', ownerType: 'USER' as any };

    it('devrait lever ConflictException si le fichier est un doublon (hash identique)', async () => {
      mockPrisma.document.findUnique.mockResolvedValueOnce({ id: 'existing', nom: 'test.pdf' });
      await expect(service.uploadDocument(file, dto)).rejects.toThrow(ConflictException);
    });

    it('devrait lever InternalServerErrorException si MinIO échoue', async () => {
      mockPrisma.document.findUnique.mockResolvedValueOnce(null);
      mockStorage.uploadBuffer.mockRejectedValueOnce(new Error('MinIO down'));
      await expect(service.uploadDocument(file, dto)).rejects.toThrow(InternalServerErrorException);
    });

    it('devrait rollback MinIO si Prisma échoue', async () => {
      mockPrisma.document.findUnique.mockResolvedValueOnce(null);
      mockStorage.uploadBuffer.mockResolvedValueOnce('path/test.pdf');
      mockPrisma.document.create.mockRejectedValueOnce(new Error('DB error'));
      await expect(service.uploadDocument(file, dto)).rejects.toThrow(InternalServerErrorException);
      expect(mockStorage.deleteObject).toHaveBeenCalledWith('path/test.pdf');
    });

    it('devrait retourner un UploadResponseDto en cas de succès', async () => {
      mockPrisma.document.findUnique.mockResolvedValueOnce(null);
      mockStorage.uploadBuffer.mockResolvedValueOnce('USER/owner-uuid/uuid-test.pdf');
      mockPrisma.document.create.mockResolvedValueOnce({
        id: 'new-uuid',
        nom: 'test.pdf',
        typeMime: 'application/pdf',
        tailleOctets: BigInt(1024),
        hashSha256: 'abc123',
        fichierUrl: 'USER/owner-uuid/uuid-test.pdf',
        createdAt: new Date(),
      });

      const result = await service.uploadDocument(file, dto);
      expect(result.id).toBe('new-uuid');
      expect(result.tailleOctets).toBe(1024);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // DOC-02 : getDocumentById
  // ─────────────────────────────────────────────────────────────
  describe('DOC-02 : getDocumentById', () => {
    it('devrait lever NotFoundException si le document est introuvable', async () => {
      mockPrisma.document.findUnique.mockResolvedValueOnce(null);
      await expect(service.getDocumentById('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('devrait retourner les métadonnées du document', async () => {
      const doc = {
        id: 'd1',
        ownerId: 'owner-1',
        ownerType: 'USER',
        nom: 'test.pdf',
        typeMime: 'application/pdf',
        tailleOctets: BigInt(2048),
        hashSha256: 'hash',
        createdAt: new Date(),
      };
      mockPrisma.document.findUnique.mockResolvedValueOnce(doc);
      const result = await service.getDocumentById('d1');
      expect(result.id).toBe('d1');
      expect(result.tailleOctets).toBe(2048);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // DOC-08 : getPresignedUrl (avec cache Redis)
  // ─────────────────────────────────────────────────────────────
  describe('DOC-08 : getPresignedUrl', () => {
    it('devrait lever NotFoundException si le document est introuvable', async () => {
      mockPrisma.document.findUnique.mockResolvedValueOnce(null);
      await expect(service.getPresignedUrl('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('devrait retourner URL depuis Redis si cache HIT', async () => {
      mockPrisma.document.findUnique.mockResolvedValueOnce({ id: 'd1', fichierUrl: 'path/file.pdf', nom: 'f.pdf' });
      mockRedisClient.get.mockResolvedValueOnce('https://minio/presigned-cached');
      mockRedisClient.ttl.mockResolvedValueOnce(300);

      const result = await service.getPresignedUrl('d1');
      expect(result.url).toBe('https://minio/presigned-cached');
      expect(result.fromCache).toBe(true);
      expect(mockStorage.generatePresignedUrl).not.toHaveBeenCalled();
    });

    it('devrait générer URL via MinIO et la mettre en cache si MISS', async () => {
      mockPrisma.document.findUnique.mockResolvedValueOnce({ id: 'd1', fichierUrl: 'path/file.pdf', nom: 'f.pdf' });
      mockRedisClient.get.mockResolvedValueOnce(null);
      mockStorage.generatePresignedUrl.mockResolvedValueOnce('https://minio/presigned-new');
      mockRedisClient.setex.mockResolvedValueOnce('OK');

      const result = await service.getPresignedUrl('d1');
      expect(result.url).toBe('https://minio/presigned-new');
      expect(result.fromCache).toBe(false);
      expect(mockRedisClient.setex).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // DOC-09 : checkIntegrity
  // ─────────────────────────────────────────────────────────────
  describe('DOC-09 : checkIntegrity', () => {
    it('devrait lever NotFoundException si le document est introuvable', async () => {
      mockPrisma.document.findUnique.mockResolvedValueOnce(null);
      await expect(service.checkIntegrity('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('devrait retourner integrityOk: true si le hash correspond', async () => {
      const fakeContent = 'contenu-connu-du-fichier';
      const expectedHash = createHash('sha256').update(fakeContent).digest('hex');
      mockPrisma.document.findUnique.mockResolvedValueOnce({
        id: 'd2',
        fichierUrl: 'path/file.pdf',
        hashSha256: expectedHash,
        ownerId: 'owner-1',
      });
      const fakeStream = Readable.from([Buffer.from(fakeContent)]);
      mockStorage.getObjectStream.mockResolvedValueOnce(fakeStream);

      const result = await service.checkIntegrity('d2');
      expect(result.integrityOk).toBe(true);
      expect(mockEventPublisher.publishDocumentValidated).not.toHaveBeenCalled();
    });

    it('devrait retourner integrityOk: false et publier un événement si hash altéré', async () => {
      const fakeContent = 'contenu-altere';
      mockPrisma.document.findUnique.mockResolvedValueOnce({
        id: 'd3',
        fichierUrl: 'path/file.pdf',
        hashSha256: 'hash-original-different',
        ownerId: 'owner-1',
      });
      const fakeStream = Readable.from([Buffer.from(fakeContent)]);
      mockStorage.getObjectStream.mockResolvedValueOnce(fakeStream);

      const result = await service.checkIntegrity('d3');
      expect(result.integrityOk).toBe(false);
      expect(mockEventPublisher.publishDocumentValidated).toHaveBeenCalledWith(
        expect.objectContaining({ isValid: false, validatedBy: 'SYSTEM' }),
      );
    });
  });
});
