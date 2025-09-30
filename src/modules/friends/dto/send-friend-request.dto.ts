import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendFriendRequestDto {
    @ApiProperty({
        description: 'ID của người nhận lời mời kết bạn',
        example: '507f1f77bcf86cd799439011'
    })
    @IsNotEmpty({ message: 'receiver_id không được để trống' })
    @IsString({ message: 'receiver_id phải là string' })
    receiver_id: string;
}

