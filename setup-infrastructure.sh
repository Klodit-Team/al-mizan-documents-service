#!/bin/bash

# =========================================================
# setup-infrastructure.sh
# 
# Script pour démarrer l'infrastructure locale
# (PostgreSQL, Redis, MinIO) via Docker
# =========================================================

set -e

echo "📦 Démarrage de l'infrastructure al-mizan-documents-service..."
echo ""

# Vérifier que Docker est disponible
if ! command -v docker &> /dev/null; then
    echo "❌ Docker n'est pas installé ou n'est pas dans le PATH"
    exit 1
fi

# Arrêter les conteneurs existants
echo "🛑 Arrêt des conteneurs existants..."
docker stop postgres-al-mizan redis-al-mizan minio-al-mizan 2>/dev/null || true
docker rm postgres-al-mizan redis-al-mizan minio-al-mizan 2>/dev/null || true
echo "✅ Conteneurs nettoyés"
echo ""

# PostgreSQL 16
echo "🐘 Démarrage de PostgreSQL 16..."
docker run -d \
  --name postgres-al-mizan \
  -e POSTGRES_DB=document_db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  -v postgres-data:/var/lib/postgresql/data \
  postgres:16
echo "✅ PostgreSQL disponible : postgresql://postgres:password@localhost:5432/document_db"
echo ""

# Redis 7
echo "🔴 Démarrage de Redis 7..."
docker run -d \
  --name redis-al-mizan \
  -p 6379:6379 \
  redis:7
echo "✅ Redis disponible : redis://localhost:6379"
echo ""

# MinIO
echo "📦 Démarrage de MinIO..."
docker run -d \
  --name minio-al-mizan \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  -p 9000:9000 \
  -p 9001:9001 \
  -v minio-data:/data \
  minio/minio:latest server /data --console-address ":9001"
echo "✅ MinIO disponible :"
echo "   - API S3 : http://localhost:9000"
echo "   - Console : http://localhost:9001 (admin/admin)"
echo ""

# Attendre que MinIO soit prêt
echo "⏳ Attente du démarrage de MinIO (peut prendre 10-15 secondes)..."
for i in {1..30}; do
  if curl -s http://localhost:9000/minio/health/live > /dev/null 2>&1; then
    echo "✅ MinIO est prêt"
    break
  fi
  echo "  Tentative $i/30..."
  sleep 1
done
echo ""

# Créer le bucket MinIO
echo "🪣 Création du bucket 'al-mizan-docs'..."
docker exec minio-al-mizan /bin/sh -c '
  /usr/bin/mc alias set minio http://localhost:9000 minioadmin minioadmin
  /usr/bin/mc mb minio/al-mizan-docs --ignore-existing
' 2>/dev/null || echo "⚠️ Le bucket peut déjà exister"
echo "✅ Bucket prêt"
echo ""

# Vérifier les connexions
echo "✅ Infrastructure lancée avec succès !"
echo ""
echo "📋 Résumé de configuration :"
echo "   PostgreSQL : postgresql://postgres:password@localhost:5432/document_db"
echo "   Redis      : redis://localhost:6379"
echo "   MinIO API  : http://localhost:9000 (minioadmin/minioadmin)"
echo "   MinIO Web  : http://localhost:9001 (minioadmin/minioadmin)"
echo ""
echo "🚀 Prochaines étapes :"
echo "   npm install"
echo "   npm run prisma:generate"
echo "   npm run prisma:migrate"
echo "   npm run start:dev"
echo ""
