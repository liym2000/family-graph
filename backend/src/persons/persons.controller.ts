import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CreatePersonDto, IdParamDto, SearchPersonsDto, UpdatePersonDto } from '../common/dto';
import { PersonsService } from './persons.service';

@Controller('persons')
export class PersonsController {
  constructor(private readonly persons: PersonsService) {}

  @Get('search')
  search(@Query() query: SearchPersonsDto) {
    return this.persons.search(query);
  }

  @Get(':id')
  get(@Param() params: IdParamDto) {
    return this.persons.get(params.id);
  }

  @Post()
  create(@Body() body: CreatePersonDto) {
    return this.persons.create(body);
  }

  @Patch(':id')
  update(@Param() params: IdParamDto, @Body() body: UpdatePersonDto) {
    return this.persons.update(params.id, body);
  }

  @Delete(':id')
  delete(@Param() params: IdParamDto) {
    return this.persons.delete(params.id);
  }
}
