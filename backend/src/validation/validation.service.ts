import { ConflictException, Injectable } from '@nestjs/common';
import { DatabaseService, QueryableDatabase } from '../database/database.service';
import { findAnomalies } from './find-anomalies';

@Injectable()
export class ValidationService {
  constructor(private readonly db: DatabaseService) {}

  anomalies(familyId: number, limit: number, database: QueryableDatabase = this.db) {
    return findAnomalies(database, familyId, limit);
  }

  async confirm(familyId: number, fingerprint: string, confirmed: boolean) {
    if (confirmed) {
      const result = await this.anomalies(familyId, 0);
      if (!result.anomalies.some((item) => item.fingerprint === fingerprint))
        throw new ConflictException('资料已变化，请重新检查');
      await this.db.query(
        'INSERT INTO review_confirmation (family_id, fingerprint) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [familyId, fingerprint],
      );
    } else {
      await this.db.query(
        'DELETE FROM review_confirmation WHERE family_id = $1 AND fingerprint = $2',
        [familyId, fingerprint],
      );
    }
    return { confirmed };
  }
}
