import { Test, TestingModule } from '@nestjs/testing';
import { StorageService } from './storage.service';
import { ConfigService } from '@nestjs/config';

// Mock du SDK MinIO pour ne pas requérir de vrai serveur
const mockPresignedGetObject = jest.fn();
const mockGetObject = jest.fn();

jest.mock('minio', () => {
  return {
    Client: jest.fn().mockImplementation(() => ({
      presignedGetObject: mockPresignedGetObject,
      getObject: mockGetObject,
    })),
  };
});

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              const config: Record<string, string> = {
                MINIO_ENDPOINT: 'localhost',
                MINIO_PORT: '9000',
                MINIO_USE_SSL: 'false',
                MINIO_ACCESS_KEY: 'minioadmin',
                MINIO_SECRET_KEY: 'minioadmin',
                MINIO_BUCKET: 'al-mizan-docs',
              };
              return config[key] ?? defaultValue ?? '';
            }),
          },
        },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
  });

  it('devrait être défini', () => {
    expect(service).toBeDefined();
  });

  describe('getPresignedUrl (DOC-08)', () => {
    it('devrait générer une URL présignée via MinIO SDK', async () => {
      const fakeUrl =
        'https://minio.local/al-mizan-docs/path/to/file.pdf?X-Amz-Signature=abc';
      mockPresignedGetObject.mockResolvedValue(fakeUrl);

      const result = await service.getPresignedUrl('path/to/file.pdf', 1800);

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
});
