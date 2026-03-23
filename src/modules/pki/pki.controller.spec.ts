import { Test, TestingModule } from '@nestjs/testing';
import { PkiController } from './pki.controller';
import { PkiService } from './pki.service';

describe('PkiController', () => {
  let controller: PkiController;

  const mockPkiService = {
    verifyCertificate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PkiController],
      providers: [
        {
          provide: PkiService,
          useValue: mockPkiService,
        },
      ],
    }).compile();

    controller = module.get<PkiController>(PkiController);
    jest.clearAllMocks();
  });

  it('devrait Ãªtre dÃ©fini', () => {
    expect(controller).toBeDefined();
  });

  describe('verifyCertificate', () => {
    it('devrait dÃ©lÃ©guer la vÃ©rification PKI au service', async () => {
      const docId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const expectedResult = {
        isValid: true,
        issuer: 'CN=ANC, C=DZ',
        subject: 'CN=Signataire, C=DZ',
        notBefore: new Date().toISOString(),
        notAfter: new Date().toISOString(),
        isRevoked: false,
      };

      mockPkiService.verifyCertificate.mockResolvedValue(expectedResult);

      const result = await controller.verifyCertificate(docId);

      expect(mockPkiService.verifyCertificate).toHaveBeenCalledWith(docId);
      expect(result).toEqual(expectedResult);
    });
  });
});
