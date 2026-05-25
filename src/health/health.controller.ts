import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({
    summary: 'Vérifier que le service est opérationnel',
    description:
      "Retourne le statut opérationnel du microservice de gestion documentaire ainsi que l'uptime du processus Node.js pour les health checks de la plateforme.",
  })
  @ApiResponse({
    status: 200,
    description: 'Service en ligne et pleinement opérationnel.',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        service: { type: 'string', example: 'document-service' },
        timestamp: { type: 'string', format: 'date-time' },
        uptime: { type: 'number', example: 45.12 },
      },
    },
  })
  check() {
    return {
      status: 'ok',
      service: 'document-service',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
