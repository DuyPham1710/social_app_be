import UserResponseDto from 'src/modules/user/dto/user.response.dto';
import { PostUrlResponseDto } from './post-url-response.dto';
import { LayoutType } from 'src/shared/enums/layout_type';
import { PrivacyBase } from 'src/common/base/privacy.base';
import { Types } from 'mongoose';

export interface PostResponseDto extends PrivacyBase {
    _id: Types.ObjectId;
    caption: string;
    userId: UserResponseDto;
    urls: PostUrlResponseDto[];
    layout: LayoutType;
    createdAt: Date;
    updatedAt: Date;
}
