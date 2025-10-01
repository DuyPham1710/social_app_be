import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PrivacyBase } from 'src/common/base/privacy.base';
import { PrivacyType } from 'src/shared/enums/privacy_type';

export type PostDocument = Post & Document;

@Schema({ timestamps: true }) // tự động tạo createdAt & updatedAt
export class Post extends PrivacyBase {
    @Prop()
    caption: string;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    userId: Types.ObjectId;

    @Prop({ type: [{ type: Types.ObjectId, ref: 'PostUrl' }] })
    urls: Types.ObjectId[];
}

export const PostSchema = SchemaFactory.createForClass(Post);

// Index để query nhanh hơn theo user và privacy
PostSchema.index({ userId: 1, privacy_type: 1 });
