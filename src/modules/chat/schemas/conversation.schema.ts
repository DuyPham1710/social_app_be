import mongoose, { Document, Types } from "mongoose";
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
    createdBy: Types.ObjectId;

    @Prop({ default: null })
    avatar?: string; // group avatar

    @Prop({
        type: new mongoose.Schema({
            messageId: { type: Types.ObjectId, ref: 'Message' },
            text: String,
            sender: { type: Types.ObjectId, ref: 'User' },
            createdAt: Date,
        }, { _id: false }),
        default: null
    })
    lastMessage: any;

    createdAt?: Date;
    updatedAt?: Date;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);