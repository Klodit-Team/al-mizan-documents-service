import { Test, TestingModule } from '@nestjs/testing';
import { PkiController } from './pki.controller';

describe('PkiController', () => {
  let controller: PkiController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PkiController],
    }).compile();

    controller = module.get<PkiController>(PkiController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
