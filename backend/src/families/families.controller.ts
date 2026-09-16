import { Body, Controller, Delete, Get, Param, Patch, Post, Res } from '@nestjs/common';
import { CreateFamilyDto, IdParamDto, ImportFamilyDto, UpdateFamilyDto } from '../common/dto';
import { FamiliesService } from './families.service';
import { FamilyImportService } from './family-import.service';
import { loadAppConfig } from '../config';

@Controller('families')
export class FamiliesController {
  constructor(
    private readonly families: FamiliesService,
    private readonly importer: FamilyImportService,
  ) {}

  @Get()
  async list() {
    return { ...(await this.families.list()), demoReadOnly: loadAppConfig().demoReadOnly };
  }

  @Post()
  create(@Body() body: CreateFamilyDto) {
    return this.families.create(body);
  }

  @Post('import')
  import(@Body() body: ImportFamilyDto) {
    return this.importer.importAsNewFamily(body);
  }

  @Get(':id/export')
  async export(@Param() params: IdParamDto, @Res({ passthrough: true }) response: any) {
    const payload = await this.families.export(params.id);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="family-${params.id}-${stamp}.json"`,
    );
    return payload;
  }

  @Patch(':id')
  update(@Param() params: IdParamDto, @Body() body: UpdateFamilyDto) {
    return this.families.update(params.id, body);
  }

  @Delete(':id')
  delete(@Param() params: IdParamDto) {
    return this.families.delete(params.id);
  }
}
