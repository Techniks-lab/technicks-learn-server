import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { and } from '@prisma/orm-postgres/orm-client';
import { PrismaService } from '../prisma/prisma.service.js';
import { BrevoService } from './email/brevo.service.js';
import { OtpRateLimiter } from './otp-rate-limiter.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import {
  ChangePasswordDto,
  ResetPasswordDto,
} from './dto/change-password.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import type { JwtPayload } from './strategies/jwt.strategy.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly brevoService: BrevoService,
    private readonly otpRateLimiter: OtpRateLimiter,
  ) {}

  async register(dto: RegisterDto, ipAddress?: string) {
    await this.purgeStaleUnverifiedUsers();

    const existingUser = await this.prisma.orm.public.User.where({
      email: dto.email,
    }).first();

    let user: {
      id: string;
      email: string;
      username: string | null;
      role: string;
      isVerified: boolean;
    };

    if (existingUser) {
      if (existingUser.isVerified) {
        throw new ConflictException('Email already registered');
      }

      const passwordHash = await bcrypt.hash(dto.password, 12);
      await this.prisma.orm.public.User.where({ id: existingUser.id }).update({
        passwordHash,
        fullName: dto.fullName,
      });

      user = {
        id: existingUser.id,
        email: existingUser.email,
        username: existingUser.username,
        role: existingUser.role,
        isVerified: false,
      };
    } else {
      this.otpRateLimiter.check(`register-ip:${ipAddress ?? 'unknown'}`, {
        windowMs: 15 * 60 * 1000,
        maxAttempts: 5,
        minIntervalMs: 0,
      });

      const passwordHash = await bcrypt.hash(dto.password, 12);

      const created = await this.prisma.orm.public.User.create({
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
      });

      user = {
        id: created.id,
        email: created.email,
        username: created.username,
        role: created.role,
        isVerified: false,
      };
    }

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.username,
      user.role,
    );

    const otp = await this.issueEmailVerification(user.id, user.email);

    const response: Record<string, unknown> = {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        isVerified: user.isVerified,
      },
      ...tokens,
      emailVerificationPending: true,
    };

    if (process.env.NODE_ENV !== 'production' && !otp.emailSent) {
      response.devOtp = otp.otp;
    }

    return response;
  }

  async setUsername(userId: string, username: string) {
    const user = await this.prisma.orm.public.User.where({ id: userId }).first();

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.username !== username) {
      const taken = await this.prisma.orm.public.User.where({ username }).first();
      if (taken && taken.id !== userId) {
        throw new ConflictException('Username already taken');
      }

      await this.prisma.orm.public.User.where({ id: userId }).update({ username });
    }

    const created = user.username === null;

    // Issue new tokens for THIS session only — do not delete every refresh
    // token the user holds, or username changes would silently log out every
    // other device. Existing refresh tokens stay valid and pick up the new
    // username on their next rotation.
    const tokens = await this.generateTokens(user.id, user.email, username, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        username,
        role: user.role,
        isVerified: user.isVerified,
      },
      created,
      ...tokens,
    };
  }

  async isUsernameAvailable(username: string) {
    const user = await this.prisma.orm.public.User.where({ username }).first();
    return { available: !user };
  }

  async resendOtp(dto: { email: string }) {
    const user = await this.prisma.orm.public.User.where({
      email: dto.email,
    }).first();

    if (user && !user.isVerified) {
      await this.issueEmailVerification(user.id, user.email);
    }

    return {
      message: 'If your email is pending verification, a new OTP has been sent',
    };
  }

  private async purgeStaleUnverifiedUsers() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await this.prisma.orm.public.User.where((u) =>
      and(u.isVerified.eq(false), u.createdAt.lt(cutoff)),
    ).deleteAll();
  }

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    const user = await this.prisma.orm.public.User.where({
      email: dto.email,
    }).first();

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.username,
      user.role,
    );

    await this.prisma.orm.public.Session.create({
      token: tokens.accessToken,
      userId: user.id,
      ipAddress,
      userAgent,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    await this.prisma.orm.public.User.where({ id: user.id }).update({
      lastActiveAt: new Date().toISOString(),
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        isVerified: user.isVerified,
      },
      ...tokens,
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.orm.public.User.where({
      id: userId,
    }).first();

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      isVerified: user.isVerified,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastActiveAt: user.lastActiveAt,
    };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const user = await this.prisma.orm.public.User.where({
      email: dto.email,
    }).first();

    if (!user) {
      throw new BadRequestException('Invalid email or OTP');
    }

    if (user.isVerified) {
      return { message: 'Email already verified' };
    }

    const verifyTokens = await this.prisma.orm.public.EmailVerification.where(
      (e) => and(e.usedAt.eq(null), e.expiresAt.gt(new Date().toISOString())),
    ).all();

    let validToken: { id: string } | null = null;
    for (const token of verifyTokens) {
      const isValid = await bcrypt.compare(dto.token, token.token);
      if (isValid && token.userId === user.id) {
        validToken = token;
        break;
      }
    }

    if (!validToken) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    await this.prisma.orm.public.EmailVerification.where({
      id: validToken.id,
    }).update({
      usedAt: new Date().toISOString(), 
    });

    await this.prisma.orm.public.EmailVerification.where({
      userId: user.id,
      usedAt: null,
    }).deleteAll();

    await this.prisma.orm.public.User.where({ id: user.id }).update({
      isVerified: true,
    });

    return { message: 'Email verified successfully' };
  }

  async logout(userId: string, accessToken: string) {
    await this.prisma.orm.public.Session.where({
      userId,
      token: accessToken,
    }).deleteAll();

    await this.prisma.orm.public.RefreshToken.where({ userId }).deleteAll();

    return { message: 'Logged out successfully' };
  }

  async refreshTokens(refreshToken: string) {
    const storedToken = await this.prisma.orm.public.RefreshToken.where((t) =>
      and(t.token.eq(refreshToken), t.expiresAt.gt(new Date().toISOString())),
    ).first();

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.orm.public.User.where({
      id: storedToken.userId,
    }).first();

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    await this.prisma.orm.public.RefreshToken.where({
      id: storedToken.id,
    }).delete();

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.username,
      user.role,
    );

    return tokens;
  }

  async forgotPassword(dto: { email: string }) {
    this.otpRateLimiter.check(`otp:${dto.email.toLowerCase()}`);

    const user = await this.prisma.orm.public.User.where({
      email: dto.email,
    }).first();

    if (!user) {
      return { message: 'If an account exists, an OTP has been sent' };
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);

    await this.prisma.orm.public.PasswordReset.where({
      userId: user.id,
      usedAt: null,
    }).deleteAll();

    await this.prisma.orm.public.PasswordReset.create({
      token: otpHash,
      userId: user.id,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });

    await this.brevoService.sendOtpEmail(user.email, otp);

    return { message: 'If an account exists, an OTP has been sent' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const resetTokens = await this.prisma.orm.public.PasswordReset.where((r) =>
      and(r.usedAt.eq(null), r.expiresAt.gt(new Date().toISOString())),
    ).all();

    let validToken: { id: string; userId: string; token: string } | null = null;
    for (const token of resetTokens) {
      const isValid = await bcrypt.compare(dto.token, token.token);
      if (isValid) {
        validToken = token as { id: string; userId: string; token: string };
        break;
      }
    }

    if (!validToken) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.orm.public.User.where({ id: validToken.userId }).update({
      passwordHash,
    });

    await this.prisma.orm.public.PasswordReset.where({
      id: validToken.id,
    }).update({
      usedAt: new Date().toISOString(),
    });

    await this.prisma.orm.public.RefreshToken.where({
      userId: validToken.userId,
    }).deleteAll();

    return { message: 'Password reset successfully' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.orm.public.User.where({
      id: userId,
    }).first();

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.orm.public.User.where({ id: userId }).update({
      passwordHash,
    });

    await this.prisma.orm.public.RefreshToken.where({ userId }).deleteAll();

    return { message: 'Password changed successfully' };
  }

  private async issueEmailVerification(userId: string, email: string) {
    this.otpRateLimiter.check(`otp:${email.toLowerCase()}`);

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);

    await this.prisma.orm.public.EmailVerification.where({
      userId,
      usedAt: null,
    }).deleteAll();

    await this.prisma.orm.public.EmailVerification.create({
      token: otpHash,
      userId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });

    let emailSent = false;
    try {
      await this.brevoService.sendVerificationOtpEmail(email, otp);
      emailSent = true;
    } catch (error) {
      this.logger.error(
        `Failed to send verification OTP email to ${email}`,
        error,
      );
    }

    return { otp, emailSent };
  }

  private async generateTokens(
    userId: string,
    email: string,
    username: string | null,
    role: string,
  ) {
    const payload: JwtPayload = { sub: userId, email, username, role };

    const jwtExpiresIn = this.configService.get<string>(
      'JWT_EXPIRES_IN',
      '15m',
    );
    const refreshExpiresIn = this.configService.get<string>(
      'REFRESH_TOKEN_EXPIRES_IN',
      '7d',
    );

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: jwtExpiresIn as any,
      }),
      this.jwtService.signAsync(payload, {
        expiresIn: refreshExpiresIn as any,
      }),
    ]);

    await this.prisma.orm.public.RefreshToken.create({
      token: refreshToken,
      userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    return { accessToken, refreshToken };
  }
}
