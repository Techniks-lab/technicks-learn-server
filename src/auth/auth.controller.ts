import {
  Controller,
  Get,
  Post,
  Body,
  Version,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Req,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import {
  ChangePasswordDto,
  ResetPasswordDto,
} from './dto/change-password.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { ResendOtpDto } from './dto/resend-otp.dto.js';
import { SetUsernameDto } from './dto/set-username.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Version('1')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: 201,
    description:
      'User registered (or OTP re-sent to an unverified account) successfully',
  })
  @ApiResponse({ status: 409, description: 'Email or username already exists' })
  @ApiResponse({ status: 429, description: 'Too many registration attempts' })
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto, @Req() req: ExpressRequest) {
    return this.authService.register(dto, req.ip);
  }

  @Post('username')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create or change the authenticated user username' })
  @ApiBody({ type: SetUsernameDto })
  @ApiResponse({ status: 200, description: 'Username set (created: true) or changed (created: false)' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 409, description: 'Username already taken' })
  @HttpCode(HttpStatus.OK)
  setUsername(
    @Request() req: any,
    @Body() dto: SetUsernameDto,
  ) {
    return this.authService.setUsername(req.user.id, dto.username);
  }

  @Get('username/check')
  @Version('1')
  @ApiOperation({ summary: 'Check if a username is available' })
  @ApiResponse({ status: 200, description: 'Availability check result' })
  @HttpCode(HttpStatus.OK)
  checkUsername(@Query('username') username: string) {
    return this.authService.isUsernameAvailable(username);
  }

  @Post('resend-otp')
  @Version('1')
  @ApiOperation({
    summary: 'Resend the email verification OTP for an unverified account',
  })
  @ApiBody({ type: ResendOtpDto })
  @ApiResponse({
    status: 200,
    description: 'OTP re-sent if the email is pending verification',
  })
  @ApiResponse({ status: 429, description: 'Too many OTP requests' })
  @HttpCode(HttpStatus.OK)
  resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto);
  }

  @Post('login')
  @Version('1')
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Login successful, returns tokens' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: ExpressRequest) {
    return this.authService.login(dto, req.ip, req.headers['user-agent']);
  }

  @Get('profile')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  profile(@Request() req: any) {
    return this.authService.getProfile(req.user.id);
  }

  @Post('logout')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Logout and invalidate session' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  logout(@Request() req: any) {
    const accessToken = req.headers.authorization?.replace('Bearer ', '');
    return this.authService.logout(req.user.id, accessToken);
  }

  @Post('refresh')
  @Version('1')
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiBody({
    schema: {
      properties: {
        refreshToken: { type: 'string', example: 'eyJhbGciOiJI...' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'New tokens returned' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  @HttpCode(HttpStatus.OK)
  refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshTokens(refreshToken);
  }

  @Post('verify-email')
  @Version('1')
  @ApiOperation({ summary: 'Verify email with the OTP sent at registration' })
  @ApiBody({ type: VerifyEmailDto })
  @ApiResponse({ status: 200, description: 'Email verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Post('forgot-password')
  @Version('1')
  @ApiOperation({ summary: 'Request password reset OTP via email' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({ status: 200, description: 'OTP sent if account exists' })
  @ApiResponse({ status: 429, description: 'Too many OTP requests' })
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Version('1')
  @ApiOperation({ summary: 'Reset password using OTP' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('change-password')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Change password (requires current password)' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 401, description: 'Current password is incorrect' })
  @HttpCode(HttpStatus.OK)
  changePassword(@Request() req: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.id, dto);
  }
}
