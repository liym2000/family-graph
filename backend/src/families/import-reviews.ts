import { ImportFamilyDto } from '../common/dto';
import { QueryableDatabase } from '../database/database.service';
import { findAnomalies } from '../validation/find-anomalies';
import { reviewIdentity, ReviewIdentity, reviewKey } from '../validation/review-identity';
import { fail, positiveInteger } from './import-format';

export async function restoreImportReviews(
  client: QueryableDatabase,
  familyId: number,
  personIdMap: Map<number, number>,
  issues: ImportFamilyDto['reviewed_issues'],
) {
  if (issues?.length) {
    const saved = new Set(
      issues.map((issue, index) => {
        if (
          !['missing_source', 'duplicate_person', 'generation_mismatch'].includes(
            String(issue.type),
          ) ||
          !Array.isArray(issue.person_ids)
        )
          fail(`reviewed_issues[${index}] is invalid`);
        const mapPerson = (value: unknown) => {
          const mapped = personIdMap.get(positiveInteger(value, 'reviewed person'));
          if (!mapped) fail('reviewed person not found');
          return mapped;
        };
        const identity: ReviewIdentity = {
          type: String(issue.type),
          person_ids: issue.person_ids.map(mapPerson),
          ...(issue.parent_id === undefined ? {} : { parent_id: mapPerson(issue.parent_id) }),
        };
        return reviewKey(identity);
      }),
    );
    const findings = await findAnomalies(client, familyId, 0);
    const importedRelations = await client.query<{ id: number; from_person_id: number }>(
      'SELECT * FROM person_relation WHERE family_id = $1 ORDER BY id',
      [familyId],
    );
    for (const issue of findings.anomalies) {
      if (saved.has(reviewKey(reviewIdentity(issue, importedRelations.rows)))) {
        await client.query(
          'INSERT INTO review_confirmation (family_id, fingerprint) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [familyId, issue.fingerprint],
        );
      }
    }
  }
}
