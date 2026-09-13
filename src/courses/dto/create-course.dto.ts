import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const COURSE_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

export class CreateCourseDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({
    description: 'URL slug; defaults to a slugified title',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  coverImage?: string;

  @ApiPropertyOptional({ enum: COURSE_STATUSES, default: 'DRAFT' })
  @IsOptional()
  @IsEnum(COURSE_STATUSES)
  status?: CourseStatus;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({
    description: 'CourseCategory id to assign; null clears it',
  })
  @IsOptional()
  @IsString()
  categoryId?: string;
}
