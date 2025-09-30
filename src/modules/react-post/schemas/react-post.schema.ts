import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReactPostDocument = ReactPost & Document;

@Schema({ timestamps: true })
export class ReactPost {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Post', default: null })
  postId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Comment', default: null })
  commentId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Emoji', required: true })
  emojiId: Types.ObjectId;
}

export const ReactPostSchema = SchemaFactory.createForClass(ReactPost);
