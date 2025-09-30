import { IsNotEmpty, IsString, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RespondFriendRequestDto {
    @ApiProperty({
        description: 'ID của friend request',
        example: '507f1f77bcf86cd799439011'
    })
    @IsNotEmpty({ message: 'request_id không được để trống' })
    @IsString({ message: 'request_id phải là string' })
    request_id: string;

}

