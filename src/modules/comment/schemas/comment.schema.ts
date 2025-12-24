import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CommentDocument = Comment & Document;
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

    // gắn thẻ ai người dùng trong comment
    @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
    taggedUserIds: Types.ObjectId[];
}


export const CommentSchema = SchemaFactory.createForClass(Comment);
