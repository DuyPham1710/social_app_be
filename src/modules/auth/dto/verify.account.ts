import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class VerifyAccountDto {
    @ApiProperty({ example: 'user@gmail.com' })
    @IsString()
    @IsNotEmpty()
    email: string;

    @ApiProperty({ example: '' })
    @IsString()
    @IsNotEmpty()
    otp: string;
}