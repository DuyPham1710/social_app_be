import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'comments' })
export class Comment {
    @Prop({ type: String })
    content: string;

    // Người viết bình luận
    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    userId: Types.ObjectId;

    // Bài post chứa bình luận
    @Prop({ type: Types.ObjectId, ref: 'Post', required: true })
    postId: Types.ObjectId;

    // Nếu là trả lời bình luận khác → parentId chính là comment cha
    @Prop({ type: Types.ObjectId, ref: 'Comment', default: null })
    parentId?: Types.ObjectId;
}

export type CommentDocument = Comment & Document;
export const CommentSchema = SchemaFactory.createForClass(Comment);
