import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReactCommentDocument = ReactComment & Document;

@Schema({ timestamps: true })
export class ReactComment {
  _id: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Comment', required: true })
  commentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Emoji', required: true })
  emojiId: Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

export const ReactCommentSchema = SchemaFactory.createForClass(ReactComment);

// Chống người dùng react nhiều lần 1 comment
ReactCommentSchema.index({ userId: 1, commentId: 1 }, { unique: true });