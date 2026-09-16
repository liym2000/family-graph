import { Controller, Get, Param, Query } from '@nestjs/common';
import { GraphService } from './graph.service';
import { GraphQueryDto, IdParamDto, RelationshipPathQueryDto, TreeQueryDto } from '../common/dto';
import { TreeService } from './tree.service';

@Controller('graph')
export class GraphController {
  constructor(
    private readonly graph: GraphService,
    private readonly tree: TreeService,
  ) {}

  @Get('tree')
  treeBranch(@Query() query: TreeQueryDto) {
    return this.tree.branch(query.familyId, query.personId, query.offset);
  }

  @Get('tree-path')
  treePath(@Query() query: RelationshipPathQueryDto) {
    return this.tree.findPath(query.familyId, query.fromId, query.toId);
  }

  @Get('relationship-path')
  relationshipPath(@Query() query: RelationshipPathQueryDto) {
    return this.graph.relationshipPath({
      familyId: query.familyId,
      fromId: query.fromId,
      toId: query.toId,
    });
  }

  @Get('person/:id')
  personGraph(@Param() params: IdParamDto, @Query() query: GraphQueryDto) {
    return this.graph.personGraph({
      centerId: params.id,
      familyId: query.familyId,
      ancestorDepth: query.ancestorDepth,
      descendantDepth: query.descendantDepth,
    });
  }
}
