-- CreateEnum
CREATE TYPE "OwnerType" AS ENUM ('USER', 'ORGANISATION');

-- CreateEnum
CREATE TYPE "PieceType" AS ENUM ('NIF', 'NIS', 'REGISTRE_COMMERCE', 'CASIER_JUDICIAIRE', 'CNAS', 'CASNOS', 'ATTESTATION_FISCALE', 'BILAN', 'AUTRE');

-- CreateEnum
CREATE TYPE "TypeAnalyse" AS ENUM ('OCR', 'NLP', 'COMPLETUDE');

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "ownerType" "OwnerType" NOT NULL,
    "nom" VARCHAR(255) NOT NULL,
    "typeMime" VARCHAR(100) NOT NULL,
    "tailleOctets" BIGINT,
    "fichierUrl" VARCHAR(500) NOT NULL,
    "hashSha256" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pieces_administratives" (
    "id" UUID NOT NULL,
    "soumissionId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "type" "PieceType" NOT NULL,
    "designation" VARCHAR(255),
    "isValide" BOOLEAN,
    "dateExpiration" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pieces_administratives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocr_analyses" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "pieceId" UUID,
    "typeAnalyse" "TypeAnalyse" NOT NULL,
    "texteExtrait" TEXT,
    "scoreConfiance" DECIMAL(5,4),
    "isConforme" BOOLEAN,
    "anomalies" JSONB,
    "analysedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ocr_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documents_hashSha256_key" ON "documents"("hashSha256");

-- CreateIndex
CREATE INDEX "documents_ownerId_ownerType_idx" ON "documents"("ownerId", "ownerType");

-- CreateIndex
CREATE INDEX "pieces_administratives_soumissionId_idx" ON "pieces_administratives"("soumissionId");

-- CreateIndex
CREATE INDEX "pieces_administratives_type_idx" ON "pieces_administratives"("type");

-- CreateIndex
CREATE INDEX "ocr_analyses_documentId_idx" ON "ocr_analyses"("documentId");

-- CreateIndex
CREATE INDEX "ocr_analyses_pieceId_idx" ON "ocr_analyses"("pieceId");

-- AddForeignKey
ALTER TABLE "pieces_administratives" ADD CONSTRAINT "pieces_administratives_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocr_analyses" ADD CONSTRAINT "ocr_analyses_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocr_analyses" ADD CONSTRAINT "ocr_analyses_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "pieces_administratives"("id") ON DELETE SET NULL ON UPDATE CASCADE;
