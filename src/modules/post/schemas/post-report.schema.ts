
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PostReportDocument = PostReport & Document;

@Schema({ timestamps: true })
export class PostReport {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Post', required: true })
  postId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  reason: string;

  @Prop({ type: String, required: false, trim: true })
  description?: string;

  @Prop({
    type: String,
    enum: ['pending', 'reviewed', 'rejected'],
    default: 'pending',
  })
  status: string;
}

export const PostReportSchema = SchemaFactory.createForClass(PostReport);


