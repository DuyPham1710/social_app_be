import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsMongoId } from 'class-validator';
import { PostInteractionType } from 'src/common/enums/post-interaction-type.enum';

export class TrackPostInteractionDto {
  @ApiProperty({ example: '66d5e7b6b9d5f0aef01b4d22' })
  @IsMongoId()
  postId: string;

  @ApiProperty({
    enum: PostInteractionType,
    example: PostInteractionType.REACT,
  })
  @IsEnum(PostInteractionType)
  interactionType: PostInteractionType;
}
