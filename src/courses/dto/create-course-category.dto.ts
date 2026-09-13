import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateCourseCategoryDto {
  @ApiProperty({ example: 'Fundamentals' })
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name!: string;

  @ApiPropertyOptional({
    example: 'fundamentals',
    description: 'Optional. Auto-generated from name if omitted.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase, alphanumeric, hyphen-separated',
  })
  slug?: string;
}