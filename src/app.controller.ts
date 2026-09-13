import { Controller, Get, Version, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Version('1')
  getHello(): string {
    return this.appService.getAPIversion();
  }

  @Get('health')
  @Version('1')
  @ApiOperation({ summary: 'Liveness/readiness check for the API and database', tags: ['health'] })
  @ApiResponse({ status: 200, description: 'API and database are healthy' })
  @ApiResponse({ status: 503, description: 'Database is unreachable' })
  @HttpCode(HttpStatus.OK)
  getHealth() {
    return this.appService.getHealth();
  }
}