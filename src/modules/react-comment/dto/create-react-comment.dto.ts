import { IsMongoId, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReactCommentDto {
  @IsMongoId()
  @IsNotEmpty()
  @ApiProperty({ example: '667e9c77e9c77e9c77e9c77e', description: 'ID của comment cần react' })
  commentId: string;
  @IsMongoId()
  @IsNotEmpty()
  @ApiProperty({ example: '667e9c77e9c77e9c77e9c77e', description: 'ID của emoji' })
  emojiId: string;
}
