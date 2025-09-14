import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EmailDto {
    @ApiProperty({ example: 'user@gmail.com' })
    @IsEmail()
    email: string;
}
