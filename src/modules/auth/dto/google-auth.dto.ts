import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GoogleAuthDto {
    @ApiProperty({ example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6...' })
    @IsString()
    @IsNotEmpty()
    idToken: string;
}
