import { IsMongoId, IsNotEmpty } from 'class-validator';

export class CreateReactStoryDto {
  @IsMongoId()
  @IsNotEmpty()
  storyId: string;

  @IsMongoId()
  @IsNotEmpty()
  emojiId: string;
}
