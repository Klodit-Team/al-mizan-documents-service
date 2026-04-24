#!/bin/sh
set -e
echo "⏳ Pushing Prisma schema..."
npx prisma db push
echo "🚀 Starting NestJS application..."
exec node dist/main
