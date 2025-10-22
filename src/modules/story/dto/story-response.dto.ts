import { Expose, Type } from 'class-transformer';
import { Types } from 'mongoose';
import { PrivacyBase } from 'src/common/base/privacy.base';
import UserResponseDto from 'src/modules/user/dto/user.response.dto';
import { DeezerMusic } from 'src/shared/interfaces/deezer-music.interface';
import { MediaType } from 'src/shared/enums/media_type';

export class StoryResponseDto extends PrivacyBase {
    @Expose()
    _id: Types.ObjectId;

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
}