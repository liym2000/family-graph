import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DemoReadOnlyGuard } from './common/demo-read-only.guard';
import { join } from 'node:path';
import { ServeStaticModule } from '@nestjs/serve-static';
import { DatabaseModule } from './database/database.module';
import { FamiliesModule } from './families/families.module';
import { PersonsModule } from './persons/persons.module';
import { RelationsModule } from './relations/relations.module';
import { GraphModule } from './graph/graph.module';
import { ValidationModule } from './validation/validation.module';
import { HealthModule } from './health/health.module';

@Module({
  providers: [{ provide: APP_GUARD, useClass: DemoReadOnlyGuard }],
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/api{/*path}'],
    }),
    DatabaseModule,
    FamiliesModule,
    PersonsModule,
    RelationsModule,
    GraphModule,
    ValidationModule,
    HealthModule,
  ],
})
export class AppModule {}
