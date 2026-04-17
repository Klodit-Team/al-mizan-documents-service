import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';

interface UploadedDocumentRef {
  type: 'NIF' | 'NIS' | 'DENOMINATION';
  document_id?: string;
  storage_key?: string;
  file_name?: string;
  url?: string;
  status?: string;
}

interface FailedDocumentRef {
  type: 'NIF' | 'NIS' | 'DENOMINATION';
  file_name: string;
  reason: string;
}

interface UserDocsResponse {
  event_id: string;
  correlation_id: string;
  organisation_id: string;
  user_id?: string;
  status: string;
  uploaded_documents: UploadedDocumentRef[];
  failed_documents: FailedDocumentRef[];
  processed_at: string;
}

@Controller()
export class UserDocsConsumer {
  private readonly logger = new Logger(UserDocsConsumer.name);

  @EventPattern('user.organisation.documents.upload.response')
  async handleUploadResponse(@Payload() payload: UserDocsResponse) {
    this.logSummary(payload);
  }

  @EventPattern('user.organisation.documents.uploaded')
  async handleUploaded(@Payload() payload: UserDocsResponse) {
    this.logSummary(payload);
  }

  @EventPattern('user.organisation.documents.upload.failed')
  async handleUploadFailed(@Payload() payload: UserDocsResponse) {
    this.logSummary(payload);
  }

  private logSummary(payload: UserDocsResponse) {
    const refs = payload.uploaded_documents.map((d) => d.document_id ?? d.storage_key ?? d.url);
    this.logger.log(
      `ACK received — correlation_id=${payload.correlation_id} organisation_id=${payload.organisation_id} status=${payload.status} references_processed=${JSON.stringify(refs)}`,
    );
  }
}
