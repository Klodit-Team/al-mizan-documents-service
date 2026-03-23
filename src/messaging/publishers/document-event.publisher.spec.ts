import { Test, TestingModule } from '@nestjs/testing';
import { DocumentEventPublisher } from './document-event.publisher';
import { PieceType } from '@prisma/client';
import { of } from 'rxjs';

describe('DocumentEventPublisher', () => {
  let publisher: DocumentEventPublisher;

  const mockClientProxy = {
    emit: jest.fn().mockReturnValue(of('published')), // Mock rxjs Observable behavior
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentEventPublisher,
        {
          provide: 'RABBITMQ_SERVICE',
          useValue: mockClientProxy,
        },
      ],
    }).compile();

    publisher = module.get<DocumentEventPublisher>(DocumentEventPublisher);
    jest.clearAllMocks();
  });

  it('devrait être défini', () => {
    expect(publisher).toBeDefined();
  });

  it('devrait publier document.uploaded avec une taille de bigInt transformée', async () => {
    const payload = {
      documentId: 'doc-1',
      hash: 'abc',
      mimeType: 'application/pdf',
      size: BigInt(5000),
      uploadedBy: 'user1',
      entityType: 'submission',
      entityId: 'sub-1',
    };

    await publisher.publishDocumentUploaded(payload);

    expect(mockClientProxy.emit).toHaveBeenCalledWith('document.uploaded', {
      ...payload,
      size: '5000', // Vérification de la transformation string
    });
  });

  it('devrait publier les autres événements métier (attached, requested, validated)', async () => {
    await publisher.publishAdministrativeAttached({
      documentId: 'd1',
      submissionId: 's1',
      pieceType: PieceType.NIF,
      ownerId: 'o1',
    });
    expect(mockClientProxy.emit).toHaveBeenCalledWith(
      'document.administrative.attached',
      expect.any(Object),
    );

    await publisher.publishOcrRequested({
      documentId: 'd1',
      storagePath: 'url',
      mimeType: 'mime',
      pieceType: PieceType.NIF,
      submissionId: 's1',
    });
    expect(mockClientProxy.emit).toHaveBeenCalledWith(
      'document.ocr.requested',
      expect.any(Object),
    );

    await publisher.publishDocumentValidated({
      documentId: 'd1',
      submissionId: 's1',
      isValid: true,
      validatedBy: 'user',
      rejectionReason: null,
    });
    expect(mockClientProxy.emit).toHaveBeenCalledWith(
      'document.validated',
      expect.any(Object),
    );
  });
});
