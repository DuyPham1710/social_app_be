import { IsMongoId, IsNotEmpty } from 'class-validator';

export class CreateReactPostDto {
  @IsMongoId()
  @IsNotEmpty()
  postId: string;

  @IsMongoId()
  @IsNotEmpty()
  emojiId: string;
}
