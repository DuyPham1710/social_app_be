import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RemoveFriendDto {
    @ApiProperty({
        description: 'ID của bạn bè cần xóa',
        example: '507f1f77bcf86cd799439011'
    })
    @IsNotEmpty({ message: 'friend_id không được để trống' })
    @IsString({ message: 'friend_id phải là string' })
    friend_id: string;
}

