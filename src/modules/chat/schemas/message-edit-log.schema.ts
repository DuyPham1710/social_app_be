import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type MessageEditLogDocument = MessageEditLog & Document;

@Schema({ timestamps: true })
export class MessageEditLog {
    _id: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Message', required: true })
    messageId: Types.ObjectId;

    @Prop({ type: String, required: true })
    oldText: string; // Nội dung tin nhắn trước khi sửa

    @Prop({ type: String, required: true })
    newText: string; // Nội dung tin nhắn sau khi sửa

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    editedBy: Types.ObjectId; // User đã chỉnh sửa

    @Prop({ type: Date, required: true })
    editedAt: Date; // Thời gian chỉnh sửa

    createdAt?: Date;
    updatedAt?: Date;
}

export const MessageEditLogSchema = SchemaFactory.createForClass(MessageEditLog);

