import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const LESSON_BLOCK_KINDS = [
  'HEADING',
  'TEXT',
  'IMAGE',
  'VIDEO',
  'QUIZ',
] as const;
export type LessonBlockKind = (typeof LESSON_BLOCK_KINDS)[number];

export class CreateLessonBlockDto {
  @ApiPropertyOptional({
    example: 0,
    description: 'Order of the block inside the lesson',
  })
  @IsOptional()
  @IsInt()
  blockIndex?: number;

  @ApiProperty({ enum: LESSON_BLOCK_KINDS })
  @IsEnum(LESSON_BLOCK_KINDS)
  kind!: LessonBlockKind;

  @ApiPropertyOptional({
    description: 'Markdown/plain content for HEADING and TEXT blocks',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  text?: string;

  @ApiPropertyOptional({ description: 'Remote URL for IMAGE and VIDEO blocks' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;

  @ApiPropertyOptional({
    type: Object,
    description:
      'Required for QUIZ blocks: { title?, passPercentage?, questions: [{ prompt, options: string[], correctIndex }] }. ' +
      'Stored server-side; correctIndex is never returned to clients.',
  })
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}

export class CreateLessonDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty()
  @IsString()
  courseId!: string;

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

  @ApiPropertyOptional({ enum: ['DRAFT', 'PUBLISHED'], default: 'DRAFT' })
  @IsOptional()
  @IsEnum(['DRAFT', 'PUBLISHED'])
  status?: 'DRAFT' | 'PUBLISHED';

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ type: [CreateLessonBlockDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateLessonBlockDto)
  blocks?: CreateLessonBlockDto[];
}
