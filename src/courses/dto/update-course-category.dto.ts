import { PartialType } from '@nestjs/swagger';
import { CreateCourseCategoryDto } from './create-course-category.dto.js';

export class UpdateCourseCategoryDto extends PartialType(
  CreateCourseCategoryDto,
) {}
