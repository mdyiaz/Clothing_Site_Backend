import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class AdminLoginDto {
  @ApiProperty({ example: 'admin@rangoli.com.bd' })
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email!: string;

  @ApiProperty({ minLength: 8, example: '••••••••' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  @MaxLength(72)
  password!: string;
}

export class RegisterDto {
  @ApiPropertyOptional({ example: 'Ayesha Rahman' })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Enter your full name.' })
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional({ example: 'customer@rangoli.com.bd' })
  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(160)
  email?: string;

  @ApiPropertyOptional({ example: '+8801711111111' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s-]{6,20}$/, { message: 'Enter a valid phone number.' })
  phone?: string;

  @ApiProperty({ minLength: 8, example: '••••••••' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  @MaxLength(72)
  password!: string;
}

export class CustomerLoginDto {
  @ApiPropertyOptional({ example: 'customer@rangoli.com.bd' })
  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email?: string;

  @ApiProperty({ example: '+8801711111111' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  @MaxLength(72)
  password!: string;
}

export class GuestLoginDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional({ example: '+8801711111111' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}

export class RefreshTokenDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class VerifySessionDto {
  @ApiProperty()
  @IsString()
  accessToken!: string;
}

export class ForgotPasswordDto {
  @ApiPropertyOptional({ example: 'customer@rangoli.com.bd' })
  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email?: string;

  @ApiPropertyOptional({ example: '+8801711111111' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s-]{6,20}$/, { message: 'Enter a valid phone number.' })
  phone?: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty({ minLength: 8, example: '••••••••' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  @MaxLength(72)
  password!: string;
}
