import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Types } from 'mongoose';

export class CreateCommentDto {
    @ApiProperty({ example: 'B�i vi?t r?t hay!', description: 'N?i dung b�nh lu?n' })
    @IsNotEmpty()
    @IsString()
    content: string;

    @ApiProperty({ example: '66f2a0bcee0b32c4eac0f83d', description: 'ID c?a b�i vi?t' })
    @IsNotEmpty()
    postId: Types.ObjectId;

    @ApiProperty({ example: '66f2a0bcee0b32c4eac0f83d', description: 'ID c?a b�nh lu?n cha (n?u l� reply)' })
    @IsOptional()
    parentId?: Types.ObjectId;

    @ApiProperty({ example: ['66f2a0bcee0b32c4eac0f83d'], description: 'Danh s�ch ID ng�����i d�ng �����c g��n th��� trong b�nh lu�n', required: false })
    @IsOptional()
    taggedUserIds?: string[];
}
