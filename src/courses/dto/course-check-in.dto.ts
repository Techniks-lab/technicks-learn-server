import { IsDateString, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CourseCheckInDto {
  @ApiPropertyOptional({
    description: 'Local calendar date as YYYY-MM-DD. Defaults to server date.',
    example: '2026-09-13',
  })
  @IsOptional()
  @IsString()
  @IsDateString()
  date?: string;
}
