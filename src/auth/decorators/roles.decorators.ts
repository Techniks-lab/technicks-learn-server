import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../enums/user-role.enum.js';

export const ROLES_KEY = 'roles';

/**
 * Attach required roles to a route or controller.
 *
 * @example
 * @Roles(UserRole.ADMIN)
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * async deleteUser() { ... }
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);