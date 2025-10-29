import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EmojiDocument = Emoji & Document;

@Schema({ timestamps: true })
export class Emoji extends Document {
  @Prop({ required: true })
  label: string;

  @Prop({ required: true })
  icon: string; // icon unicode hoặc url ảnh

  @Prop({ default: true })
  isActive: boolean; // để quản lý hiển thị
}

export const EmojiSchema = SchemaFactory.createForClass(Emoji);
