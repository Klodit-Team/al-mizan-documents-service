import { Test, TestingModule } from '@nestjs/testing';
import { AdministrativePiecesController } from './administrative-pieces.controller';
import { AdministrativePiecesService } from './administrative-pieces.service';
import { PieceType } from '@prisma/client';
import { AttachPieceDto } from './dto/attach-piece.dto';
import { ValidatePieceDto } from './dto/validate-piece.dto';

describe('AdministrativePiecesController', () => {
  let controller: AdministrativePiecesController;

  // Mock du service pour isoler le test du contrÃ´leur
  const mockAdministrativePiecesService = {
    attachPiece: jest.fn(),
    getPiecesBySubmission: jest.fn(),
    validatePiece: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdministrativePiecesController],
      providers: [
        {
          provide: AdministrativePiecesService,
          useValue: mockAdministrativePiecesService,
        },
      ],
    }).compile();

    controller = module.get<AdministrativePiecesController>(
      AdministrativePiecesController,
    );

    // Nettoyer tous les appels aux mocks aprÃ¨s chaque test
    jest.clearAllMocks();
  });

  it('devrait Ãªtre dÃ©fini', () => {
    expect(controller).toBeDefined();
  });

  describe('attachPiece', () => {
    it('devrait relayer les donnÃ©es au service et retourner son rÃ©sultat', async () => {
      const submissionId = 'sub-1';
      const dto = { documentId: 'doc-1', type: PieceType.CASNOS };
      const expectedResponse = { message: 'Ok', piece: { id: 'p1' } };

      mockAdministrativePiecesService.attachPiece.mockResolvedValue(
        expectedResponse,
      );

      const result = await controller.attachPiece(
        submissionId,
        dto as AttachPieceDto,
      );

      expect(mockAdministrativePiecesService.attachPiece).toHaveBeenCalledWith(
        submissionId,
        dto,
      );
      expect(result).toEqual(expectedResponse);
    });
  });

  describe('getPiecesBySubmission', () => {
    it('devrait relayer lid de soumission au service lister', async () => {
      const submissionId = 'sub-2';
      const expectedArray = [{ id: '1' }, { id: '2' }];

      mockAdministrativePiecesService.getPiecesBySubmission.mockResolvedValue(
        expectedArray,
      );

      const result = await controller.getPiecesBySubmission(submissionId);

      expect(
        mockAdministrativePiecesService.getPiecesBySubmission,
      ).toHaveBeenCalledWith(submissionId);
      expect(result).toEqual(expectedArray);
    });
  });

  describe('validatePiece', () => {
    it('devrait relayer au service la validation et le payload', async () => {
      const pieceId = 'p-1';
      const dto = {
        isValide: false,
        reason: 'Document flou',
      } as ValidatePieceDto;
      const expectedResponse = {
        message: 'DÃ©cision enregistrÃ©e avec succÃ¨s',
      };

      mockAdministrativePiecesService.validatePiece.mockResolvedValue(
        expectedResponse,
      );

      const result = await controller.validatePiece(pieceId, dto);

      expect(
        mockAdministrativePiecesService.validatePiece,
      ).toHaveBeenCalledWith(pieceId, dto);
      expect(result).toEqual(expectedResponse);
    });
  });
});
