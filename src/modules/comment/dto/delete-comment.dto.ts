import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';
import { Types } from 'mongoose';

export class DeleteCommentDto {
    @ApiProperty({ example: '66f2a0bcee0b32c4eac0f83d', description: 'ID c?a b�nh lu?n' })
    @IsNotEmpty()
    commentId: Types.ObjectId;

    @ApiProperty({ example: '66f2a0bcee0b32c4eac0f83d', description: 'ID c?a b�i vi?t' })
    @IsNotEmpty()
    postId: Types.ObjectId;
}
