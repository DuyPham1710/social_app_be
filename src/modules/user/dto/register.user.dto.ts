import { ApiProperty } from "@nestjs/swagger";
import {
    IsEmail,
    IsNotEmpty,
    IsString,
    Length
} from "class-validator";
import { Match } from "src/common/decorators/match.decorator";

export default class RegisterUserDto {
    // @ApiProperty({ example: 'Phạm Ngọc Duy' })
    // @IsString()
    // @IsNotEmpty()
    // fullName: string;

    // @ApiProperty({ example: 'Hello, I am Duy!' })
    // @IsOptional()
    // @IsString()
    // bio?: string;

    // @ApiProperty({ example: '' })
    // @IsOptional()
    // @IsString()
    // avatarUrl?: string;

    // @ApiProperty({ example: '2000-01-01' })
    // @IsString()
    // @IsNotEmpty()
    // dateOfBirth: string;

    // @ApiProperty({ example: 'male' })
    // @IsString()
    // @IsNotEmpty()
    // gender: string;

    @ApiProperty({ example: 'duy@gmail.com' })
    @IsEmail()
    email: string;

    @ApiProperty({ example: '' })
    @IsString()
    @IsNotEmpty()
    username: string;

    @ApiProperty({ example: '' })
    @IsString()
    @IsNotEmpty()
    @Length(6, 14, { message: 'Password must be between 6 and 14 characters' })
    password: string;

    @ApiProperty({ example: '' })
    @IsString()
    @IsNotEmpty()
    @Length(6, 14, { message: 'Confirm password must be between 6 and 14 characters' })
    @Match('password', { message: 'Password and confirm password must match' })
    confirmPassword: string;
}