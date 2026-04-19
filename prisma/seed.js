require('dotenv').config();

const { PrismaClient, Prisma } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding documents database...');

  const seededHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

  const document = await prisma.document.upsert({
    where: { hashSha256: seededHash },
    update: {
      nom: 'nif_operateur.pdf',
      typeMime: 'application/pdf',
      tailleOctets: BigInt(524288),
      fichierUrl: 'http://localhost:9000/documents/nif_operateur.pdf',
    },
    create: {
      ownerId: '33333333-3333-3333-3333-333333333333',
      ownerType: 'USER',
      nom: 'nif_operateur.pdf',
      typeMime: 'application/pdf',
      tailleOctets: BigInt(524288),
      fichierUrl: 'http://localhost:9000/documents/nif_operateur.pdf',
      hashSha256: seededHash,
    },
  });

  const pieceCount = await prisma.pieceAdministrative.count({
    where: {
      soumissionId: 'seed-soumission-0001',
      documentId: document.id,
      type: 'NIF',
    },
  });

  if (pieceCount === 0) {
    await prisma.pieceAdministrative.create({
      data: {
        soumissionId: 'seed-soumission-0001',
        documentId: document.id,
        type: 'NIF',
        designation: 'Numero d identification fiscale',
        isValide: true,
      },
    });
  }

  const ocrCount = await prisma.ocrAnalyse.count({
    where: {
      documentId: document.id,
      typeAnalyse: 'OCR',
    },
  });

  if (ocrCount === 0) {
    await prisma.ocrAnalyse.create({
      data: {
        documentId: document.id,
        typeAnalyse: 'OCR',
        texteExtrait: 'NIF 000000000002',
        scoreConfiance: new Prisma.Decimal('0.9735'),
        isConforme: true,
        anomalies: [],
      },
    });
  }

  console.log('Seed complete: 1 document with administrative piece and OCR analysis ensured.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
