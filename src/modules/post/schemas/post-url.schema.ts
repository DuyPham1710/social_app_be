import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PostUrlDocument = PostUrl & Document;

@Schema({ timestamps: true })
export class PostUrl extends Document {
    @Prop({ required: true })
    url: string;

    @Prop()
    title: string;

    // @Prop({ type: Types.ObjectId, ref: 'Post', required: true })
    // postId: Types.ObjectId;

    @Prop({ default: 0 })
    order: number;
}

export const PostUrlSchema = SchemaFactory.createForClass(PostUrl);
