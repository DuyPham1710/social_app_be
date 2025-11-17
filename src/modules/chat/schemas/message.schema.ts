import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type MessageDocument = Message & Document;

@Schema({ timestamps: true })
export class Message {
    _id: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true })
    conversationId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    senderId: Types.ObjectId;

    @Prop({ type: String, default: null })
    text: string;

    @Prop({
        type: [{
            url: String,
            type: { type: String }, // image, video, file, audio
            size: Number,
        }],
        default: []
    })
    attachments: {
        url: string;
        type: string;
        size: number;
    }[];

    @Prop({ type: Types.ObjectId, ref: 'Message', default: null })
    replyTo?: Types.ObjectId; // reply message

    @Prop({
        type: [{
            userId: { type: Types.ObjectId, ref: 'User' },
            reaction: String, // ❤️ 👍 😢 👍🏻 ...
        }],
        default: []
    })
    reactions: {
        userId: Types.ObjectId;
        reaction: string;
    }[];

    @Prop({
        type: [{
            userId: { type: Types.ObjectId, ref: 'User' },
            seenAt: Date
        }],
        default: []
    })
    seenBy: {
        userId: Types.ObjectId;
        seenAt: Date;
    }[];

    @Prop({ default: false })
    deletedForEveryone: boolean;

    @Prop({
        type: [{ type: Types.ObjectId, ref: 'User' }],
        default: []
    })
    deletedFor: Types.ObjectId[];

    createdAt?: Date;
    updatedAt?: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);