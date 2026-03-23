import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Vérifier que le service est opérationnel' })
  @ApiResponse({ status: 200, description: 'Service en ligne.' })
  check() {
    return {
      status: 'ok',
      service: 'document-service',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
