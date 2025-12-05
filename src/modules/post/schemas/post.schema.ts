import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PrivacyBase } from 'src/common/base/privacy.base';
import { LayoutType } from 'src/shared/enums/layout_type';
import { PrivacyType } from 'src/shared/enums/privacy_type';

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

    @Prop({ type: Boolean, default: false })
    isHidden?: boolean;
}

export const PostSchema = SchemaFactory.createForClass(Post);

// Index để query nhanh hơn theo user và privacy
PostSchema.index({ userId: 1, privacy_type: 1 });
