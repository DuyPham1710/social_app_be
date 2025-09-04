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
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    fullName?: string;


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

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    bio?: string;

    @IsOptional()
    @IsString()
    avatarUrl?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    dateOfBirth?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    gender?: string;

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
