import { Test, TestingModule } from '@nestjs/testing';
import { PkiService } from './pki.service';

describe('PkiService', () => {
  let service: PkiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PkiService],
    }).compile();

    service = module.get<PkiService>(PkiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
