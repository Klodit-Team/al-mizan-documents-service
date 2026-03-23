import { Test, TestingModule } from '@nestjs/testing';
import { CachingService } from './caching.service';

const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisDel = jest.fn();

const mockRedisClient = {
  get: mockRedisGet,
  set: mockRedisSet,
  del: mockRedisDel,
};

describe('CachingService', () => {
  let service: CachingService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CachingService,
        {
          provide: 'REDIS_CLIENT',
          useValue: mockRedisClient,
        },
      ],
    }).compile();

    service = module.get<CachingService>(CachingService);
  });

  it('devrait être défini', () => {
    expect(service).toBeDefined();
  });

  it('devrait appeler get() sur le client Redis avec la bonne clé', async () => {
    mockRedisGet.mockResolvedValue('url-cached');

    const result = await service.get('presignedUrl:doc-1');

    expect(mockRedisGet).toHaveBeenCalledWith('presignedUrl:doc-1');
    expect(result).toBe('url-cached');
  });

  it('devrait appeler set() avec EX et le bon TTL', async () => {
    mockRedisSet.mockResolvedValue('OK');

    await service.set('presignedUrl:doc-1', 'https://minio/url', 1800);

    expect(mockRedisSet).toHaveBeenCalledWith(
      'presignedUrl:doc-1',
      'https://minio/url',
      'EX',
      1800,
    );
  });

  it('devrait appeler del() pour invalider une clé du cache', async () => {
    mockRedisDel.mockResolvedValue(1);

    await service.del('presignedUrl:doc-1');

    expect(mockRedisDel).toHaveBeenCalledWith('presignedUrl:doc-1');
  });

  it('devrait retourner null si la clé est absente du cache', async () => {
    mockRedisGet.mockResolvedValue(null);

    const result = await service.get('presignedUrl:absent');

    expect(result).toBeNull();
  });
});
