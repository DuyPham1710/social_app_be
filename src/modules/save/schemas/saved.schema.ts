import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SaveDocument = Saved & Document;

@Schema({ timestamps: true })
export class Saved {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  targetId: Types.ObjectId;

  @Prop({ required: true, enum: ['post', 'reel', 'comment'], index: true })
  type: string;

  // lưu link hình ảnh hoặc video hoặc nội dung comment
  @Prop({ default: '' })
  content: string;

  @Prop({ default: 'default' })
  collection: string;

  // lưu id bài post nếu type là comment
  @Prop({ default: '' })
  note: string;
}

export const SaveSchema = SchemaFactory.createForClass(Saved);

//unique index chống save trùng
SaveSchema.index({ userId: 1, targetId: 1, type: 1 }, { unique: true });

//tối ưu query
SaveSchema.index({ userId: 1, type: 1 });
SaveSchema.index({ targetId: 1, type: 1 });
SaveSchema.index({ userId: 1, collection: 1 });