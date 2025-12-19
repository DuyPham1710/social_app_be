import { IsMongoId, IsNotEmpty } from 'class-validator';

export class UpdateReactCommentDto {
  @IsMongoId()
  @IsNotEmpty()
  emojiId: string;
}
