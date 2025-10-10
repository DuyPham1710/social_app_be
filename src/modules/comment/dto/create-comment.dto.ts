import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Types } from 'mongoose';

export class CreateCommentDto {
    @ApiProperty({ example: 'Bài vi?t r?t hay!', description: 'N?i dung bình lu?n' })
    @IsNotEmpty()
    @IsString()
    content: string;

    @ApiProperty({ example: '66f2a0bcee0b32c4eac0f83d', description: 'ID c?a bài vi?t' })
    @IsNotEmpty()
    postId: Types.ObjectId;

    @ApiProperty({ example: '66f2a0bcee0b32c4eac0f83d', description: 'ID c?a bình lu?n cha (n?u là reply)' })
    @IsOptional()
    parentId?: Types.ObjectId;
}
