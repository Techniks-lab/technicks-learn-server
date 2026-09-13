import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResendOtpDto {
  @ApiProperty({ example: 'john@example.com', description: 'Email pending verification to resend the OTP to' })
  @IsEmail()
  email!: string;
}