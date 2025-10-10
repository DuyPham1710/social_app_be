import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateCommentDto } from './create-comment.dto';
import { IsNotEmpty } from 'class-validator';
import { IsString } from 'class-validator';

export class UpdateCommentDto extends PartialType(CreateCommentDto) {
    @ApiProperty({ example: '66f2a0bcee0b32c4eac0f83d', description: 'ID c?a b�nh lu?n' })
    @IsNotEmpty()
    @IsString()
    commentId: string;
}
