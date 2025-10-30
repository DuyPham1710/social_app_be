import { IsMongoId, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReactPostDto {
  @IsMongoId()
  @IsNotEmpty()
  @ApiProperty({ example: '667e9c77e9c77e9c77e9c77e', description: 'ID của bài post cần react' })
  postId: string;

  @IsMongoId()
  @IsNotEmpty()
  @ApiProperty({ example: '667e9c77e9c77e9c77e9c77e', description: 'ID của emoji' })
  emojiId: string;
}
