import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PostViewDocument = PostView & Document;

@Schema({ timestamps: true })
export class PostView {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Post', required: true, index: true })
  postId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;
}

export const PostViewSchema = SchemaFactory.createForClass(PostView);

// Mỗi user chỉ tính 1 view cho 1 post
PostViewSchema.index({ postId: 1, userId: 1 }, { unique: true });
