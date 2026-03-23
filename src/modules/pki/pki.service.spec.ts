import { Test, TestingModule } from '@nestjs/testing';
import { PkiService } from './pki.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('PkiService', () => {
  let service: PkiService;

  const mockPrismaService = {
    document: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PkiService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<PkiService>(PkiService);
    jest.clearAllMocks();
  });

  it('devrait être défini', () => {
    expect(service).toBeDefined();
  });

  describe('verifyCertificate', () => {
    const docId = 'doc-pki-uuid-1';

    it("devrait lever NotFoundException si le document n'existe pas", async () => {
      mockPrismaService.document.findUnique.mockResolvedValue(null);
      await expect(service.verifyCertificate(docId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("devrait lever BadRequestException si le document n'est pas un PDF (pas de signature PAdES)", async () => {
      mockPrismaService.document.findUnique.mockResolvedValue({
        id: docId,
        typeMime: 'image/jpeg',
        ownerType: 'ORGANISATION',
      });
      await expect(service.verifyCertificate(docId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('devrait retourner une structure de vérification PKI valide pour un PDF', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue({
        id: docId,
        typeMime: 'application/pdf',
        ownerType: 'ORGANISATION',
      });

      const result = await service.verifyCertificate(docId);

      expect(result.isValid).toBe(true);
      expect(result.isRevoked).toBe(false);
      expect(result.issuer).toContain('DZ');
      expect(result.subject).toContain('DZ');
      expect(typeof result.notBefore).toBe('string');
      expect(typeof result.notAfter).toBe('string');
    });
  });
});
