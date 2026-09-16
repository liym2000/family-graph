import { Module } from '@nestjs/common';
import { FamiliesController } from './families.controller';
import { FamiliesService } from './families.service';
import { FamilyImportService } from './family-import.service';

@Module({
  controllers: [FamiliesController],
  providers: [FamiliesService, FamilyImportService],
})
export class FamiliesModule {}
