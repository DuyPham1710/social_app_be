import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Types } from 'mongoose';

export class CreateCommentDto {
    @ApiProperty({ example: 'Bài viết rất hay!', description: 'Nội dung bình luận' })
    @IsNotEmpty()
    @IsString()
    content: string;

    @ApiProperty({ example: '66f2a0bcee0b32c4eac0f83d', description: 'ID của bài viết' })
    @IsNotEmpty()
    postId: Types.ObjectId;

    @ApiProperty({ example: '66f2a0bcee0b32c4eac0f83d', description: 'ID của bình luận cha (nếu là reply)' })
    @IsOptional()
    parentId?: Types.ObjectId;
}
