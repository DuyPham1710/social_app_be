import { ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsBoolean,
    IsDate,
    IsEmail,
    IsNotEmpty,
    IsOptional,
    IsString,
    Length
} from 'class-validator';

export default class UpdateUserDto {
    @ApiPropertyOptional({ description: 'User ID', example: '12345' })
    @IsOptional()
    @IsString()
    userId?: string;

    @ApiPropertyOptional({ description: 'Full name', example: 'Nguyen Van A' })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    fullName?: string;

    @ApiPropertyOptional({ description: 'Phone number', example: '0987654321' })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    phoneNumber?: string;

    @IsOptional()
    @IsEmail()
    @IsNotEmpty()
    email?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    username?: string;

    @IsOptional()
    @IsString()
    @Length(6, 14, { message: 'Password must be between 6 and 14 characters' })
    password?: string;

    @ApiPropertyOptional({ description: 'Bio', example: 'I love Flutter' })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    bio?: string;

    @IsOptional()
    @IsString()
    avatarUrl?: string;

    @ApiPropertyOptional({ description: 'Date of birth (yyyy-mm-dd)', example: '2000-01-01' })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    dateOfBirth?: string;

    @ApiPropertyOptional({ description: 'Gender', example: 'male' })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    gender?: string;

    @IsOptional()
    @IsString()
    coverUrl?: string;

    @ApiPropertyOptional({ description: 'school', example: 'a' })
    @IsOptional()
    @IsString()
    school?: string;

    @ApiPropertyOptional({ description: 'currentCity', example: 'a' })
    @IsOptional()
    @IsString()
    currentCity?: string;

    @ApiPropertyOptional({ description: 'hometown', example: 'a' })
    @IsOptional()
    @IsString()
    hometown?: string;

    @ApiPropertyOptional({ description: 'workplace', example: 'a' })
    @IsOptional()
    @IsString()
    workplace?: string;

    @ApiPropertyOptional({ description: 'relationshipStatus', example: 'a' })
    @IsOptional()
    @IsString()
    relationshipStatus?: string;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsString()
    otp?: string;

    @IsOptional()
    @IsDate()
    otpGeneratedTime?: Date;
}
