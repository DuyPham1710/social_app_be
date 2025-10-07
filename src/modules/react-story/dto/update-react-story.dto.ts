import { IsMongoId, IsNotEmpty } from 'class-validator';

export class UpdateReactStoryDto {
  @IsMongoId()
  @IsNotEmpty()
  emojiId: string;
}
