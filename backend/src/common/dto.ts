import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Gender, RelationType } from './types';

export function toNumber(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  return Number(value);
}

export function toNullableNumber(value: unknown) {
  if (value === null) return null;
  return toNumber(value);
}

export function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class IdParamDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  id!: number;
}

export class FamilyIdQueryDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  familyId!: number;
}

export class CreateFamilyDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  surname?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateFamilyDto {
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  surname?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  remark?: string;
}

export class SearchPersonsDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  familyId!: number;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  q = '';

  @Transform(({ value }) => toNumber(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  generation?: number;

  @IsOptional()
  @IsIn(['missing_source', 'duplicate', 'generation_mismatch'])
  issue?: string;

  @Transform(({ value }) => Number(value ?? 80))
  @IsOptional()
  @IsInt()
  @Min(1)
  limit = 80;

  @Transform(({ value }) => Number(value ?? 0))
  @IsOptional()
  @IsInt()
  @Min(0)
  offset = 0;

  @IsOptional()
  @IsIn([
    'relevance',
    'name',
    'generation',
    'number',
    'generation_asc',
    'generation_desc',
    'ancestor_generations_asc',
    'ancestor_generations_desc',
    'descendant_generations_asc',
    'descendant_generations_desc',
    'children_count_asc',
    'children_count_desc',
  ])
  sort?: string;

  @IsOptional()
  @IsIn(['male', 'female', 'unknown'])
  gender?: string;
}

export class PersonLinkDto {
  @IsInt()
  @Min(1)
  person_id!: number;

  @IsIn(['parent', 'spouse', 'child'])
  role!: 'parent' | 'spouse' | 'child';
}

export class TreeQueryDto extends FamilyIdQueryDto {
  @Transform(({ value }) => toNumber(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  personId?: number;

  @Transform(({ value }) => Number(value ?? 0))
  @IsInt()
  @Min(0)
  @Max(1000000)
  offset = 0;
}

export class CreatePersonDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PersonLinkDto)
  links?: PersonLinkDto[];
  @IsOptional()
  @IsInt()
  @Min(1)
  relative_id?: number;

  @IsOptional()
  @IsIn(['parent', 'spouse', 'child'])
  relative_role?: 'parent' | 'spouse' | 'child';

  @Transform(({ obj, value }) => Number(value ?? obj.familyId))
  @IsInt()
  @Min(1)
  family_id!: number;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Transform(({ value }) => toNumber(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  generation?: number;

  @IsOptional()
  @IsIn(['male', 'female', 'unknown', 'M', 'F'])
  gender?: Gender | 'M' | 'F';

  @IsOptional()
  @IsString()
  remark?: string;

  @IsOptional()
  @IsString()
  source?: string;
}

export class UpdatePersonDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PersonLinkDto)
  links?: PersonLinkDto[];
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @Transform(({ value }) => toNullableNumber(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  generation?: number | null;

  @IsOptional()
  @IsIn(['male', 'female', 'unknown', 'M', 'F'])
  gender?: Gender | 'M' | 'F';

  @IsOptional()
  @IsString()
  remark?: string | null;

  @IsOptional()
  @IsString()
  source?: string | null;
}

export class CreateRelationDto {
  @Transform(({ obj, value }) => Number(value ?? obj.familyId))
  @IsInt()
  @Min(1)
  family_id!: number;

  @Transform(({ obj, value }) => Number(value ?? obj.fromPersonId))
  @IsInt()
  @Min(1)
  from_person_id!: number;

  @Transform(({ obj, value }) => Number(value ?? obj.toPersonId))
  @IsInt()
  @Min(1)
  to_person_id!: number;

  @Transform(({ obj, value }) => value ?? obj.relationType)
  @IsIn(['parent', 'spouse'])
  relation_type!: RelationType;
}

export class GraphQueryDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  familyId!: number;

  @Transform(({ value }) => Number(value ?? 3))
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  ancestorDepth = 3;

  @Transform(({ value }) => Number(value ?? 2))
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(8)
  descendantDepth = 2;
}

export class ImportFamilyDto {
  @IsOptional()
  @IsArray()
  reviewed_issues?: Array<Record<string, unknown>>;
  @IsOptional()
  @IsArray()
  excluded_auto_parents?: Array<Record<string, unknown>>;
  @IsIn(['family_graph_export'])
  format!: 'family_graph_export';

  @IsInt()
  @IsIn([1])
  version!: 1;

  @IsObject()
  family!: Record<string, unknown>;

  @IsArray()
  people!: Array<Record<string, unknown>>;

  @IsArray()
  relations!: Array<Record<string, unknown>>;
}

export class RelationshipPathQueryDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  familyId!: number;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  fromId!: number;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  toId!: number;
}

export class AnomaliesQueryDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  familyId!: number;

  @Transform(({ value }) => Number(value ?? 100))
  @IsOptional()
  @IsInt()
  @Min(0)
  limit = 100;
}
