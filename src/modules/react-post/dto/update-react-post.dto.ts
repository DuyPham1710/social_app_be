import { IsMongoId } from 'class-validator';

export class UpdateReactPostDto {
  @IsMongoId()
  emojiId: string;
}
