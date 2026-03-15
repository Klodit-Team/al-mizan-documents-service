import { Test, TestingModule } from '@nestjs/testing';
import { AdministrativePiecesService } from './administrative-pieces.service';

describe('AdministrativePiecesService', () => {
  let service: AdministrativePiecesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AdministrativePiecesService],
    }).compile();

    service = module.get<AdministrativePiecesService>(AdministrativePiecesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
