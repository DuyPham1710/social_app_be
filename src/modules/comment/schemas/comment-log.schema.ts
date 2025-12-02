import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'comment_logs' })
export class CommentLog {
    // ID của comment được chỉnh sửa
    @Prop({ type: Types.ObjectId, ref: 'Comment', required: true })
    commentId: Types.ObjectId;

    // Nội dung cũ trước khi chỉnh sửa
    @Prop({ type: String, required: true })
    oldContent: string;

    // Nội dung mới sau khi chỉnh sửa
    @Prop({ type: String, required: true })
    newContent: string;

    // User thực hiện chỉnh sửa
    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    editedBy: Types.ObjectId;
}

export type CommentLogDocument = CommentLog & Document;
export const CommentLogSchema = SchemaFactory.createForClass(CommentLog);

