import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty } from 'class-validator';

export class InviteMemberDto {
    @ApiProperty({ description: 'ID của user được mời' })
    @IsMongoId()
    @IsNotEmpty()
    userId: string;
}
