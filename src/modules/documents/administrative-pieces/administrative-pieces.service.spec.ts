import { Test, TestingModule } from '@nestjs/testing';
import { AdministrativePiecesService } from './administrative-pieces.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PieceType } from '@prisma/client';
import { DocumentEventPublisher } from '../../../messaging/publishers/document-event.publisher';

describe('AdministrativePiecesService', () => {
  let service: AdministrativePiecesService;

  const mockPrismaService = {
    document: {
      findUnique: jest.fn(),
    },
    pieceAdministrative: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdministrativePiecesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: DocumentEventPublisher,
          useValue: {
            publishAdministrativeAttached: jest.fn(),
            publishOcrRequested: jest.fn(),
            publishDocumentValidated: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AdministrativePiecesService>(
      AdministrativePiecesService,
    );
    jest.clearAllMocks();
  });

  it('devrait être défini', () => {
    expect(service).toBeDefined();
  });

  describe('DOC-03 : attachPiece', () => {
    const submissionId = 'c020d0fe-0000-0000-0000-cad123456789';
    const documentId = 'd1101111-0000-0000-0000-bad123456789';

    it("devrait lever NotFoundException si le document n'est pas trouvé dans MinIO/DB", async () => {
      mockPrismaService.document.findUnique.mockResolvedValue(null);

      await expect(
        service.attachPiece(submissionId, { documentId, type: PieceType.NIF }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.document.findUnique).toHaveBeenCalledWith({
        where: { id: documentId },
      });
    });

    it('devrait lever ConflictException si ce type de pièce (ex: NIF) est déjà associé', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue({
        id: documentId,
      });
      mockPrismaService.pieceAdministrative.findFirst.mockResolvedValue({
        id: 'piece-existante',
        type: PieceType.NIF,
      });

      await expect(
        service.attachPiece(submissionId, { documentId, type: PieceType.NIF }),
      ).rejects.toThrow(ConflictException);
    });

    it('devrait créer et rattacher la pièce administrative si tout est correct', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue({
        id: documentId,
        ownerId: 'owner-1',
        fichierUrl: 'path/file.pdf',
        typeMime: 'application/pdf',
      });
      mockPrismaService.pieceAdministrative.findFirst.mockResolvedValue(null);

      const fakeCreatedPiece = { id: 'new-piece-id', type: PieceType.NIF };
      mockPrismaService.pieceAdministrative.create.mockResolvedValue(
        fakeCreatedPiece,
      );

      const expDate = '2030-12-31T00:00:00.000Z';

      const result = await service.attachPiece(submissionId, {
        documentId,
        type: PieceType.NIF,
        dateExpiration: expDate,
      });

      expect(result.piece).toEqual(fakeCreatedPiece);
      expect(mockPrismaService.pieceAdministrative.create).toHaveBeenCalledWith(
        {
          data: {
            soumissionId: submissionId,
            documentId,
            type: PieceType.NIF,
            designation: null,
            dateExpiration: new Date(expDate),
          },
        },
      );
    });
  });

  describe('DOC-10 : getPiecesBySubmission', () => {
    it("devrait retourner les pièces d'une soumission en incluant l'URL physique", async () => {
      const fakePieces = [
        {
          id: '1',
          type: PieceType.NIF,
          document: { fichierUrl: 'minio://bucket/file.pdf' },
        },
      ];
      mockPrismaService.pieceAdministrative.findMany.mockResolvedValue(
        fakePieces,
      );

      const result = await service.getPiecesBySubmission('sub-123');

      expect(result).toEqual(fakePieces);
      expect(
        mockPrismaService.pieceAdministrative.findMany,
      ).toHaveBeenCalledWith({
        where: { soumissionId: 'sub-123' },
        include: { document: true },
      });
    });
  });

  describe('DOC-04 : validatePiece', () => {
    const pieceId = 'p-uuid-1';

    it("devrait lever NotFoundException si la pièce n'existe pas", async () => {
      mockPrismaService.pieceAdministrative.findUnique.mockResolvedValue(null);

      await expect(
        service.validatePiece(pieceId, { isValide: true }),
      ).rejects.toThrow(NotFoundException);
    });

    it('doit invalider FORCÉMENT une pièce expirée, même si la commission a demandé TRUE', async () => {
      const pastDate = new Date();
      pastDate.setFullYear(pastDate.getFullYear() - 1);

      mockPrismaService.pieceAdministrative.findUnique.mockResolvedValue({
        id: pieceId,
        dateExpiration: pastDate,
        documentId: 'doc-1',
        soumissionId: 'sub-1',
      });
      mockPrismaService.pieceAdministrative.update.mockResolvedValue({});

      const result = await service.validatePiece(pieceId, { isValide: true });

      expect(result.appliedDecision).toBe(false);
      expect(result.appliedReason).toContain('Rejet automatique');
      expect(mockPrismaService.pieceAdministrative.update).toHaveBeenCalledWith(
        {
          where: { id: pieceId },
          data: { isValide: false },
        },
      );
    });

    it('devrait enregistrer la validation correctement si le document est légalement valide', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      mockPrismaService.pieceAdministrative.findUnique.mockResolvedValue({
        id: pieceId,
        dateExpiration: futureDate,
        documentId: 'doc-1',
        soumissionId: 'sub-1',
      });
      mockPrismaService.pieceAdministrative.update.mockResolvedValue({
        id: pieceId,
        isValide: true,
      });

      const result = await service.validatePiece(pieceId, {
        isValide: true,
        reason: 'Tout est en règle',
      });

      expect(result.appliedDecision).toBe(true);
      expect(result.appliedReason).toBe('Tout est en règle');
    });
  });
});
