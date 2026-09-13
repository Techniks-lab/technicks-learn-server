import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
  Version,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { GamificationService } from './gamification.service.js';

@ApiTags('Gamification')
@Controller('gamification')
export class GamificationController {
  constructor(private readonly gamificationService: GamificationService) {}

  @Get('me')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get your total XP' })
  async getMe(@Req() req: any) {
    return this.gamificationService.getMe(req.user.id);
  }

  @Get('leaderboard')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: "Get the current week's leaderboard with tiers" })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async leaderboard(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.gamificationService.leaderboard(
      req.user.id,
      parseInt(limit || '50', 10),
      parseInt(offset || '0', 10),
    );
  }
}
