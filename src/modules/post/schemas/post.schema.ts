import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PostDocument = Post & Document;

@Schema({ timestamps: true }) // tự động tạo createdAt & updatedAt
export class Post extends Document {
    @Prop()
    caption: string;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    userId: Types.ObjectId;

    @Prop({ type: [{ type: Types.ObjectId, ref: 'PostUrl' }] })
    urls: Types.ObjectId[];

    // @Prop({ type: Types.ObjectId, ref: 'Privacy', required: true })
    // privacyId: Types.ObjectId;
}

export const PostSchema = SchemaFactory.createForClass(Post);
