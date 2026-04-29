import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PrivacyBase } from 'src/common/base/privacy.base';
import { LayoutType } from 'src/shared/enums/layout_type';
import { PrivacyType } from 'src/shared/enums/privacy_type';

export enum CommunityPostStatus {
    PENDING = 'pending',
    APPROVED = 'approved',
    REJECTED = 'rejected',
}

export type PostDocument = Post & Document;

@Schema({ timestamps: true }) // tự động tạo createdAt & updatedAt
export class Post extends PrivacyBase {
    _id: Types.ObjectId;
    @Prop()
    caption: string;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    userId: Types.ObjectId;

    @Prop({ type: [{ type: Types.ObjectId, ref: 'PostUrl' }] })
    urls: Types.ObjectId[];

    @Prop({
        type: String,
        enum: LayoutType,
        default: LayoutType.CLASSIC,
    })
    layout: LayoutType;

    // @Prop({ default: 0 })
    // reactCount: number;

    // @Prop({ default: 0 })
    // commentCount: number;

    // @Prop({ default: 0 })
    // shareCount: number;

    @Prop({ default: 0 })
    viewCount: number;

    @Prop({ type: Boolean, default: false })
    isHidden?: boolean;

    // Nếu là bài viết trong cộng đồng, lưu communityId
    @Prop({ type: Types.ObjectId, ref: 'Community', default: null })
    communityId?: Types.ObjectId;

    // Trạng thái duyệt bài trong cộng đồng (chỉ dùng khi communityId != null)
    @Prop({
        type: String,
        enum: CommunityPostStatus,
        default: null,
    })
    communityStatus?: CommunityPostStatus;

    @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
    taggedUserIds: Types.ObjectId[];

    @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
    visibleOnProfileUserIds: Types.ObjectId[];
}

export const PostSchema = SchemaFactory.createForClass(Post);

// Index để query nhanh hơn theo user và privacy
PostSchema.index({ userId: 1, privacy_type: 1 });
// Index cho community posts
PostSchema.index({ communityId: 1, communityStatus: 1 });
// Index cho tagged users
PostSchema.index({ taggedUserIds: 1 });
// Index cho visible on profile tagged users
PostSchema.index({ visibleOnProfileUserIds: 1 });
