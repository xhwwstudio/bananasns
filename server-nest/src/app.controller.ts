import { Controller, Get } from '@nestjs/common';

/** GET /api/health — matches the Express health endpoint. */
@Controller('api')
export class AppController {
  @Get('health')
  health() {
    return { ok: true, app: 'BananaSNS' };
  }
}
