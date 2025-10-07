import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReactStoryDocument = ReactStory & Document;

@Schema({ timestamps: true })
export class ReactStory {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Story', required: true })
  storyId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Emoji', required: true })
  emojiId: Types.ObjectId;
}

export const ReactStorySchema = SchemaFactory.createForClass(ReactStory);

// 1 user chỉ được react 1 story
ReactStorySchema.index({ userId: 1, storyId: 1 }, { unique: true });
