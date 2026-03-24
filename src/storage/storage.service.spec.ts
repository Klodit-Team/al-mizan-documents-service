import { Test, TestingModule } from '@nestjs/testing';
import { StorageService } from './storage.service';

// Mocks des méthodes MinIO SDK utilisées
const mockBucketExists = jest.fn().mockResolvedValue(true);
const mockPutObject = jest.fn().mockResolvedValue({});
const mockPresignedGetObject = jest.fn();
const mockGetObject = jest.fn();
const mockRemoveObject = jest.fn().mockResolvedValue(undefined);

jest.mock('minio', () => ({
  Client: jest.fn().mockImplementation(() => ({
    bucketExists: mockBucketExists,
    makeBucket: jest.fn().mockResolvedValue(undefined),
    putObject: mockPutObject,
    presignedGetObject: mockPresignedGetObject,
    getObject: mockGetObject,
    removeObject: mockRemoveObject,
  })),
}));

// Simuler les variables d'env MinIO en test
process.env.MINIO_ENDPOINT = 'localhost';
process.env.MINIO_PORT = '9000';
process.env.MINIO_USE_SSL = 'false';
process.env.MINIO_ACCESS_KEY = 'minioadmin';
process.env.MINIO_SECRET_KEY = 'minioadmin';
process.env.MINIO_BUCKET_NAME = 'al-mizan-docs';

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockBucketExists.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [StorageService],
    }).compile();

    service = module.get<StorageService>(StorageService);
  });

  it('devrait être défini', () => {
    expect(service).toBeDefined();
  });

  describe('generatePresignedUrl (DOC-08)', () => {
    it('devrait générer une URL présignée via MinIO SDK', async () => {
      const fakeUrl =
        'https://minio.local/al-mizan-docs/path/to/file.pdf?X-Amz-Signature=abc';
      mockPresignedGetObject.mockResolvedValue(fakeUrl);

      const result = await service.generatePresignedUrl(
        'path/to/file.pdf',
        1800,
      );

      expect(mockPresignedGetObject).toHaveBeenCalledWith(
        'al-mizan-docs',
        'path/to/file.pdf',
        1800,
      );
      expect(result).toBe(fakeUrl);
    });
  });

  describe('getObjectStream (DOC-09)', () => {
    it('devrait retourner un stream depuis MinIO pour le recalcul SHA-256', async () => {
      const fakeStream = { pipe: jest.fn() };
      mockGetObject.mockResolvedValue(fakeStream);

      const result = await service.getObjectStream('path/to/file.pdf');

      expect(mockGetObject).toHaveBeenCalledWith(
        'al-mizan-docs',
        'path/to/file.pdf',
      );
      expect(result).toBe(fakeStream);
    });
  });

  describe('isHealthy', () => {
    it('devrait retourner true si MinIO est joignable', async () => {
      mockBucketExists.mockResolvedValue(true);
      const result = await service.isHealthy();
      expect(result).toBe(true);
    });

    it('devrait retourner false si MinIO est injoignable', async () => {
      mockBucketExists.mockRejectedValue(new Error('Connection refused'));
      const result = await service.isHealthy();
      expect(result).toBe(false);
    });
  });
});
