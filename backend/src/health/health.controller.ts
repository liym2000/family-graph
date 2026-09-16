import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async check() {
    try {
      await this.database.query('SELECT 1');
      return { ok: true, data: { status: 'healthy' } };
    } catch {
      throw new ServiceUnavailableException({ ok: false, data: { status: 'unhealthy' } });
    }
  }
}
