import { Expose, Transform, Type } from 'class-transformer';
import { PrivacyBase } from 'src/common/base/privacy.base';
import UserResponseDto from 'src/modules/user/dto/user.response.dto';
import { DeezerMusic } from 'src/shared/interfaces/deezer-music.interface';
import { MediaType } from 'src/shared/enums/media_type';
import { ReactStoryResponseDto } from 'src/modules/react-story/dto/react-story-response.dto';
import { EmojiResponseDto } from 'src/modules/emoji/dto/emoji_response.dto';

export class StoryResponseDto extends PrivacyBase {
    @Expose()
    @Transform(({ obj }) => obj._id?.toString() || obj.id?.toString())
    _id: string;

    @Expose()
    title?: string;

    @Expose()
    @Type(() => UserResponseDto)
    userId: UserResponseDto;

    @Expose()
    mediaUrl?: string;

    @Expose()
    mediaType: MediaType;

    @Expose()
    music?: DeezerMusic;

    @Expose()
    expireAt: Date;

    @Expose()
    createdAt: Date;

    @Expose()
    updatedAt: Date;

    @Expose()
    reacts?: ReactStoryResponseDto[];

    @Expose()
    isReact?: EmojiResponseDto | null;
}