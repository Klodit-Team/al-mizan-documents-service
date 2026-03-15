import { Test, TestingModule } from '@nestjs/testing';
import { AdministrativePiecesController } from './administrative-pieces.controller';

describe('AdministrativePiecesController', () => {
  let controller: AdministrativePiecesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdministrativePiecesController],
    }).compile();

    controller = module.get<AdministrativePiecesController>(AdministrativePiecesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
