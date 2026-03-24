/* eslint-disable */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { StorageService } from '../src/storage/storage.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * E2E test suite — Document Service
 *
 * Les services externes (MinIO, Redis, RabbitMQ, PostgreSQL) sont mockés
 * pour que le pipeline CI puisse tourner sans infrastructure réelle.
 */
describe('AppController (e2e)', () => {
  let app: INestApplication;

  // ─── Mocks des dépendances externes ─────────────────────────────────────
  const mockStorageService = {
    uploadBuffer: jest.fn().mockResolvedValue('mocked-object-name'),
    generatePresignedUrl: jest.fn().mockResolvedValue('https://mocked-url.com/file'),
    deleteObject: jest.fn().mockResolvedValue(undefined),
  };

  const mockPrismaService = {
    document: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({
        id: 'mocked-uuid',
        nom: 'test.pdf',
        typeMime: 'application/pdf',
        tailleOctets: BigInt(1024),
        fichierUrl: 'mocked-object-name',
        hashSha256: 'mocked-hash',
        createdAt: new Date(),
      }),
    },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  const mockRedisClient = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    on: jest.fn(),
    quit: jest.fn().mockResolvedValue('OK'),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue(mockStorageService)
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .overrideProvider('REDIS_CLIENT')
      .useValue(mockRedisClient)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health — should return 200', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200);
  });
});
