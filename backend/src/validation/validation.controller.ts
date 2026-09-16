import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsBoolean, IsInt, Matches, Min } from 'class-validator';
import { AnomaliesQueryDto } from '../common/dto';
import { ValidationService } from './validation.service';

class ConfirmationDto {
  @IsInt()
  @Min(1)
  familyId!: number;

  @Matches(/^[a-f0-9]{64}$/)
  fingerprint!: string;

  @IsBoolean()
  confirmed!: boolean;
}

@Controller('validation')
export class ValidationController {
  constructor(private readonly validation: ValidationService) {}

  @Post('confirmation')
  confirm(@Body() body: ConfirmationDto) {
    return this.validation.confirm(body.familyId, body.fingerprint, body.confirmed);
  }

  @Get('anomalies')
  anomalies(@Query() query: AnomaliesQueryDto) {
    return this.validation.anomalies(query.familyId, query.limit);
  }
}
