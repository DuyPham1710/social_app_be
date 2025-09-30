import { IsMongoId, IsOptional } from 'class-validator';

export class CreateReactPostDto {
  @IsMongoId()
  userId: string;

  @IsOptional()
  @IsMongoId()
  postId?: string;

  @IsOptional()
  @IsMongoId()
  commentId?: string;

  @IsMongoId()
  emojiId: string;
}
