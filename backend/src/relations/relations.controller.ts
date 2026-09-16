import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import { IsInt, Min } from 'class-validator';
import { CreateRelationDto, IdParamDto } from '../common/dto';
import { RelationsService } from './relations.service';

class AdjustParentDto {
  @IsInt()
  @Min(1)
  parentId!: number;
}

@Controller('relations')
export class RelationsController {
  constructor(private readonly relations: RelationsService) {}

  @Post()
  create(@Body() body: CreateRelationDto) {
    return this.relations.create({
      familyId: body.family_id,
      fromPersonId: body.from_person_id,
      toPersonId: body.to_person_id,
      relationType: body.relation_type,
    });
  }

  @Delete(':id')
  delete(@Param() params: IdParamDto) {
    return this.relations.delete(params.id);
  }

  @Patch(':id/parent')
  adjustParent(@Param() params: IdParamDto, @Body() body: AdjustParentDto) {
    return this.relations.adjustParent(params.id, body.parentId);
  }
}
