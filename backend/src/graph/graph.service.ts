import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Person, Relation } from '../common/types';

type PathDirection = 'forward' | 'reverse';
type PathEdge = Relation & { from_name?: string; to_name?: string };

@Injectable()
export class GraphService {
  constructor(private readonly db: DatabaseService) {}

  async personGraph(input: {
    centerId: number;
    familyId: number;
    ancestorDepth: number;
    descendantDepth: number;
  }) {
    const center = await this.db.query('SELECT * FROM person WHERE id = $1 AND family_id = $2', [
      input.centerId,
      input.familyId,
    ]);
    if (!center.rowCount) throw new NotFoundException('person not found');

    const relations = await this.db.query(
      `
      SELECT * FROM person_relation
      WHERE family_id = $1 AND relation_type IN ('parent', 'spouse')
      `,
      [input.familyId],
    );
    const parentEdges = relations.rows.filter((row) => row.relation_type === 'parent');
    const spouseEdges = relations.rows.filter((row) => row.relation_type === 'spouse');
    const visible = new Set<number>([input.centerId]);

    let frontier = new Set<number>([input.centerId]);
    for (let depth = 0; depth < input.ancestorDepth; depth += 1) {
      const next = new Set<number>();
      for (const id of frontier) {
        for (const edge of parentEdges) {
          if (Number(edge.to_person_id) === id) {
            const parentId = Number(edge.from_person_id);
            if (!visible.has(parentId)) {
              visible.add(parentId);
              next.add(parentId);
            }
          }
        }
      }
      if (!next.size) break;
      frontier = next;
    }

    frontier = new Set<number>([input.centerId]);
    for (let depth = 0; depth < input.descendantDepth; depth += 1) {
      const next = new Set<number>();
      for (const id of frontier) {
        for (const edge of parentEdges) {
          if (Number(edge.from_person_id) === id) {
            const childId = Number(edge.to_person_id);
            if (!visible.has(childId)) {
              visible.add(childId);
              next.add(childId);
            }
          }
        }
      }
      if (!next.size) break;
      frontier = next;
    }

    for (const edge of parentEdges) {
      if (Number(edge.to_person_id) === input.centerId) {
        for (const siblingEdge of parentEdges) {
          if (Number(siblingEdge.from_person_id) === Number(edge.from_person_id)) {
            visible.add(Number(siblingEdge.to_person_id));
          }
        }
      }
    }

    const relatives = new Set(visible);
    for (const edge of spouseEdges) {
      if (relatives.has(Number(edge.from_person_id))) visible.add(Number(edge.to_person_id));
      if (relatives.has(Number(edge.to_person_id))) visible.add(Number(edge.from_person_id));
    }

    const ids = Array.from(visible);
    const people = await this.db.query(
      'SELECT * FROM person WHERE id IN (SELECT value FROM json_each($1)) ORDER BY COALESCE(generation, 999), id',
      [ids],
    );
    const edges = relations.rows
      .filter(
        (edge) =>
          visible.has(Number(edge.from_person_id)) && visible.has(Number(edge.to_person_id)),
      )
      .map((edge) => ({
        id: edge.id,
        source: edge.from_person_id,
        target: edge.to_person_id,
        type: edge.relation_type,
      }));
    return {
      centerId: input.centerId,
      nodes: people.rows.map((person) => ({
        id: person.id,
        person_no: person.person_no,
        label: person.name,
        generation: person.generation,
        gender: person.gender,
        source: person.source,
        isCenter: Number(person.id) === input.centerId,
      })),
      edges,
    };
  }

  async relationshipPath(input: { familyId: number; fromId: number; toId: number }) {
    const peopleResult = await this.db.query<Person>(
      `
      SELECT *
      FROM person
      WHERE family_id = $1 AND id IN (SELECT value FROM json_each($2))
      `,
      [input.familyId, [input.fromId, input.toId]],
    );
    const peopleById = new Map(peopleResult.rows.map((person) => [Number(person.id), person]));
    if (!peopleById.has(input.fromId) || !peopleById.has(input.toId)) {
      throw new NotFoundException('person not found');
    }

    if (input.fromId === input.toId) {
      const person = peopleById.get(input.fromId) as Person;
      return {
        fromId: input.fromId,
        toId: input.toId,
        found: true,
        centerId: input.fromId,
        nodes: [this.graphNode(person, input.fromId)],
        edges: [],
        pathNodeIds: [input.fromId],
        pathEdgeIds: [],
        steps: [],
      };
    }

    const relations = await this.db.query<PathEdge>(
      `
      SELECT
        r.*,
        fp.name AS from_name,
        tp.name AS to_name
      FROM person_relation r
      JOIN person fp ON fp.id = r.from_person_id
      JOIN person tp ON tp.id = r.to_person_id
      WHERE r.family_id = $1 AND r.relation_type IN ('parent', 'spouse')
      ORDER BY r.id
      `,
      [input.familyId],
    );

    const adjacency = new Map<
      number,
      Array<{ nextId: number; edge: PathEdge; direction: PathDirection }>
    >();
    for (const edge of relations.rows) {
      const fromPersonId = Number(edge.from_person_id);
      const toPersonId = Number(edge.to_person_id);
      adjacency.set(fromPersonId, [
        ...(adjacency.get(fromPersonId) || []),
        { nextId: toPersonId, edge, direction: 'forward' },
      ]);
      adjacency.set(toPersonId, [
        ...(adjacency.get(toPersonId) || []),
        { nextId: fromPersonId, edge, direction: 'reverse' },
      ]);
    }

    const queue = [input.fromId];
    const visited = new Set<number>([input.fromId]);
    const previous = new Map<
      number,
      { parentId: number; edge: PathEdge; direction: PathDirection }
    >();

    for (let index = 0; index < queue.length; index += 1) {
      const currentId = queue[index];
      if (currentId === input.toId) break;
      for (const candidate of adjacency.get(currentId) || []) {
        if (visited.has(candidate.nextId)) continue;
        visited.add(candidate.nextId);
        previous.set(candidate.nextId, {
          parentId: currentId,
          edge: candidate.edge,
          direction: candidate.direction,
        });
        queue.push(candidate.nextId);
      }
    }

    if (!previous.has(input.toId)) {
      return {
        fromId: input.fromId,
        toId: input.toId,
        found: false,
        centerId: input.fromId,
        nodes: [],
        edges: [],
        pathNodeIds: [],
        pathEdgeIds: [],
        steps: [],
      };
    }

    const pathNodeIds = [input.toId];
    const pathEdges: Array<{ edge: PathEdge; direction: PathDirection }> = [];
    let currentId = input.toId;
    while (currentId !== input.fromId) {
      const link = previous.get(currentId);
      if (!link) break;
      pathEdges.push({ edge: link.edge, direction: link.direction });
      pathNodeIds.push(link.parentId);
      currentId = link.parentId;
    }
    pathNodeIds.reverse();
    pathEdges.reverse();

    const pathPeople = await this.db.query<Person>(
      `
      SELECT *
      FROM person
      WHERE family_id = $1 AND id IN (SELECT value FROM json_each($2))
      `,
      [input.familyId, pathNodeIds],
    );
    const pathPeopleById = new Map(pathPeople.rows.map((person) => [Number(person.id), person]));
    const pathEdgeIds = pathEdges.map(({ edge }) => Number(edge.id));

    return {
      fromId: input.fromId,
      toId: input.toId,
      found: true,
      centerId: input.fromId,
      nodes: pathNodeIds
        .map((personId) => pathPeopleById.get(personId))
        .filter((person): person is Person => Boolean(person))
        .map((person) => ({
          ...this.graphNode(person, input.fromId),
          isRelationEndpoint: [input.fromId, input.toId].includes(Number(person.id)),
          isRelationPath: true,
        })),
      edges: pathEdges.map(({ edge }) => ({
        id: Number(edge.id),
        source: Number(edge.from_person_id),
        target: Number(edge.to_person_id),
        type: edge.relation_type,
      })),
      pathNodeIds,
      pathEdgeIds,
      steps: pathEdges.map(({ edge, direction }, index) => ({
        type: edge.relation_type,
        label: this.relationshipStepLabel(edge, direction),
        fromId: pathNodeIds[index],
        toId: pathNodeIds[index + 1],
      })),
    };
  }

  private graphNode(person: Person, centerId: number) {
    return {
      id: Number(person.id),
      person_no: person.person_no,
      label: person.name,
      generation: person.generation,
      gender: person.gender,
      source: person.source,
      isCenter: Number(person.id) === centerId,
    };
  }

  private relationshipStepLabel(edge: PathEdge, direction: PathDirection) {
    if (edge.relation_type === 'spouse') return '配偶';
    return direction === 'forward' ? '子女' : '父母';
  }
}
