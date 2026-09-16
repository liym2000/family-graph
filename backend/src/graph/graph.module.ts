import { Module } from '@nestjs/common';
import { GraphController } from './graph.controller';
import { GraphService } from './graph.service';
import { TreeService } from './tree.service';

@Module({
  controllers: [GraphController],
  providers: [GraphService, TreeService],
})
export class GraphModule {}
