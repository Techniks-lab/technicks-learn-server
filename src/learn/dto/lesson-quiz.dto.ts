import { ArrayMinSize, IsArray, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LessonQuizDto {
  @ApiProperty({
    type: [Number],
    example: [0, 2, 1],
    description: 'Selected option index (0-based) for each quiz question',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  answers!: number[];
}