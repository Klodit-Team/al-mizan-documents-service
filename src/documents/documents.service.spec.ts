// =========================================================
// src/documents/documents.service.spec.ts
//
// Tests unitaires pour DocumentsService.
// On mock toutes les dépendances externes (Prisma, MinIO, Redis)
// pour tester UNIQUEMENT la logique métier du service.
//
// Couverture :
//  ✅ uploadDocument — cas nominal
//  ✅ uploadDocument — doublon de hash → ConflictException
//  ✅ uploadDocument — échec MinIO → InternalServerErrorException
//  ✅ uploadDocument — échec Prisma → rollback MinIO + InternalServerErrorException
//  ✅ getPresignedUrl — document inexistant → NotFoundException
//  ✅ getPresignedUrl — cache HIT → retour Redis sans appel MinIO
//  ✅ getPresignedUrl — cache MISS → génération MinIO + mise en cache
//  ✅ getPresignedUrl — Redis down → génération sans cache (graceful degradation)
// =========================================================

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

// ── Mocks ────────────────────────────────────────────────
// On crée des mocks manuels plutôt que jest.mock() pour avoir
// un contrôle précis sur les valeurs de retour par test.

const mockPrismaService = {
  document: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
};

const mockStorageService = {
  uploadBuffer: jest.fn(),
  generatePresignedUrl: jest.fn(),
  deleteObject: jest.fn(),
};

const mockRedisClient = {
  get: jest.fn(),
  setex: jest.fn(),
  ttl: jest.fn(),
};

// ── Fixtures ─────────────────────────────────────────────
const mockFile: Express.Multer.File = {
  fieldname: 'file',
  originalname: 'mon-bilan-2024.pdf',
  encoding: '7bit',
  mimetype: 'application/pdf',
  // Buffer avec du contenu pour que le hash SHA-256 soit calculable
  buffer: Buffer.from('contenu du fichier de test'),
  size: 25,
  destination: '',
  filename: '',
  path: '',
  stream: null as any,
};

const mockUploadDto = {
  ownerId: '550e8400-e29b-41d4-a716-446655440000',
  ownerType: 'USER' as any,
};

const mockDocumentDB = {
  id: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
  ownerId: mockUploadDto.ownerId,
  ownerType: 'USER',
  nom: 'mon-bilan-2024.pdf',
  typeMime: 'application/pdf',
  tailleOctets: BigInt(25),
  fichierUrl: 'USER/550e8400.../abc-mon-bilan-2024.pdf',
  hashSha256: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  createdAt: new Date('2025-01-15T10:30:00Z'),
};

// ─────────────────────────────────────────────────────────────
describe('DocumentsService', () => {
  let service: DocumentsService;

  beforeEach(async () => {
    // Réinitialiser tous les mocks avant chaque test
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: StorageService, useValue: mockStorageService },
        // Custom provider token string → useValue direct
        { provide: 'REDIS_CLIENT', useValue: mockRedisClient },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
  });

  // ─── uploadDocument ───────────────────────────────────
  describe('uploadDocument()', () => {

    it('devrait uploader un document et retourner le DTO', async () => {
      // Arrange
      mockPrismaService.document.findUnique.mockResolvedValue(null); // Pas de doublon
      mockStorageService.uploadBuffer.mockResolvedValue(mockDocumentDB.fichierUrl);
      mockPrismaService.document.create.mockResolvedValue(mockDocumentDB);

      // Act
      const result = await service.uploadDocument(mockFile, mockUploadDto);

      // Assert
      expect(result.id).toBe(mockDocumentDB.id);
      expect(result.nom).toBe('mon-bilan-2024.pdf');
      expect(result.hashSha256).toHaveLength(64); // SHA-256 hex = 64 chars
      expect(result.tailleOctets).toBe(25);        // BigInt converti en number
      expect(typeof result.tailleOctets).toBe('number'); // Vérifier la conversion BigInt

      // Vérifier que Prisma.create a bien été appelé avec les bonnes données
      expect(mockPrismaService.document.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ownerId: mockUploadDto.ownerId,
            ownerType: 'USER',
            typeMime: 'application/pdf',
          }),
        }),
      );
    });

    it('devrait lever ConflictException si le hash existe déjà (doublon)', async () => {
      // Arrange — simuler un doublon trouvé en DB
      mockPrismaService.document.findUnique.mockResolvedValue({
        id: 'existing-id',
        nom: 'fichier-existant.pdf',
      });

      // Act & Assert
      await expect(
        service.uploadDocument(mockFile, mockUploadDto),
      ).rejects.toThrow(ConflictException);

      // Vérifier que MinIO N'a PAS été appelé (pas de gaspillage bande passante)
      expect(mockStorageService.uploadBuffer).not.toHaveBeenCalled();
    });

    it('devrait lever InternalServerErrorException si MinIO échoue', async () => {
      // Arrange
      mockPrismaService.document.findUnique.mockResolvedValue(null);
      mockStorageService.uploadBuffer.mockRejectedValue(new Error('MinIO connection refused'));

      // Act & Assert
      await expect(
        service.uploadDocument(mockFile, mockUploadDto),
      ).rejects.toThrow(InternalServerErrorException);

      // Vérifier que Prisma N'a PAS été appelé (pas d'enregistrement sans fichier)
      expect(mockPrismaService.document.create).not.toHaveBeenCalled();
    });

    it('devrait rollback MinIO si Prisma échoue', async () => {
      // Arrange
      mockPrismaService.document.findUnique.mockResolvedValue(null);
      mockStorageService.uploadBuffer.mockResolvedValue(mockDocumentDB.fichierUrl);
      mockPrismaService.document.create.mockRejectedValue(new Error('DB connection lost'));

      // Act & Assert
      await expect(
        service.uploadDocument(mockFile, mockUploadDto),
      ).rejects.toThrow(InternalServerErrorException);

      // ROLLBACK : Vérifier que deleteObject a été appelé avec le bon chemin
      expect(mockStorageService.deleteObject).toHaveBeenCalledWith(
        mockDocumentDB.fichierUrl,
      );
    });
  });

  // ─── getPresignedUrl ──────────────────────────────────
  describe('getPresignedUrl()', () => {

    it('devrait lever NotFoundException si le document n\'existe pas en DB', async () => {
      // Arrange
      mockPrismaService.document.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.getPresignedUrl('id-inexistant'),
      ).rejects.toThrow(NotFoundException);
    });

    it('devrait retourner l\'URL depuis Redis si elle est en cache (HIT)', async () => {
      // Arrange
      mockPrismaService.document.findUnique.mockResolvedValue(mockDocumentDB);
      mockRedisClient.get.mockResolvedValue('https://minio/presigned-url-cached');
      mockRedisClient.ttl.mockResolvedValue(240); // 4 minutes restantes

      // Act
      const result = await service.getPresignedUrl(mockDocumentDB.id);

      // Assert
      expect(result.url).toBe('https://minio/presigned-url-cached');
      expect(result.fromCache).toBe(true);
      expect(result.ttlSeconds).toBe(240);

      // MinIO NE doit PAS être appelé quand le cache est chaud
      expect(mockStorageService.generatePresignedUrl).not.toHaveBeenCalled();
    });

    it('devrait générer une URL MinIO et la mettre en cache si Redis MISS', async () => {
      // Arrange
      mockPrismaService.document.findUnique.mockResolvedValue(mockDocumentDB);
      mockRedisClient.get.mockResolvedValue(null); // MISS
      mockStorageService.generatePresignedUrl.mockResolvedValue(
        'https://minio/new-presigned-url',
      );
      mockRedisClient.setex.mockResolvedValue('OK');

      // Act
      const result = await service.getPresignedUrl(mockDocumentDB.id);

      // Assert
      expect(result.url).toBe('https://minio/new-presigned-url');
      expect(result.fromCache).toBe(false);

      // Redis.setex DOIT être appelé pour mettre en cache
      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        `presignedUrl:${mockDocumentDB.id}`,
        expect.any(Number), // TTL
        'https://minio/new-presigned-url',
      );
    });

    it('devrait retourner l\'URL même si Redis est down (graceful degradation)', async () => {
      // Arrange — Redis lance une erreur à chaque appel
      mockPrismaService.document.findUnique.mockResolvedValue(mockDocumentDB);
      mockRedisClient.get.mockRejectedValue(new Error('Redis ECONNREFUSED'));
      mockStorageService.generatePresignedUrl.mockResolvedValue(
        'https://minio/fallback-url',
      );
      mockRedisClient.setex.mockRejectedValue(new Error('Redis ECONNREFUSED'));

      // Act — NE DOIT PAS throw même avec Redis down
      const result = await service.getPresignedUrl(mockDocumentDB.id);

      // Assert — Le service fonctionne sans Redis (dégradé mais opérationnel)
      expect(result.url).toBe('https://minio/fallback-url');
      expect(result.fromCache).toBe(false);
    });
  });
});
