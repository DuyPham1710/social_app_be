import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, Length } from "class-validator";

export default class ResetPasswordDto {
    @ApiProperty({ example: 'user@gmail.com' })
    @IsString()
    @IsNotEmpty()
    email: string;

    @ApiProperty({ example: '' })
    @IsString()
    @IsNotEmpty()
    @Length(6, 14, { message: 'Password must be between 6 and 14 characters' })
    newPassword: string;

    @ApiProperty({ example: '' })
    @IsString()
    @IsNotEmpty()
    confirmNewPassword: string;
}