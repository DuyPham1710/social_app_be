import { Document, Types } from "mongoose";
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type ConversationDocument = Conversation & Document;

@Schema({ timestamps: true })
export class Conversation {
    _id: Types.ObjectId;

    @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], required: true })
    participants: Types.ObjectId[];  // danh sách thành viên

    @Prop({ default: false })
    isGroup: boolean;

    @Prop()
    name?: string; // nếu là group

    @Prop({ type: Types.ObjectId, ref: 'User', default: null })
    createdBy?: Types.ObjectId;

    @Prop({ default: null })
    avatar?: string; // group avatar

    @Prop({ type: Types.ObjectId, ref: 'Message', default: null })
    lastMessageId?: Types.ObjectId;

    createdAt?: Date;
    updatedAt?: Date;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);