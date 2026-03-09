import UserResponseDto from 'src/modules/user/dto/user.response.dto';
import { PostUrlResponseDto } from './post-url-response.dto';
import { LayoutType } from 'src/shared/enums/layout_type';
import { PrivacyBase } from 'src/common/base/privacy.base';
import { Types } from 'mongoose';
import { ReactPostResponseDto } from 'src/modules/react-post/dto/react-post-response.dto';
import { EmojiResponseDto } from 'src/modules/emoji/dto/emoji_response.dto';

export interface PostResponseDto extends PrivacyBase {
    _id: Types.ObjectId;
    caption: string;
    userId: UserResponseDto;
    urls: PostUrlResponseDto[];
    layout: LayoutType;
    // reactCount?: number;
    // commentCount?: number;
    reacts?: ReactPostResponseDto[];
    isReact?: EmojiResponseDto | null;
    createdAt: Date;
    updatedAt: Date;
}
