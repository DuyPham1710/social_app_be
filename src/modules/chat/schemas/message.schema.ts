import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";
import { Attachment, AttachmentSchema } from "./attachment.schema";
import { Reaction, ReactionSchema } from "./reaction.schema";
import { SeenBy, SeenBySchema } from "./seen-by.schema";

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
        type: [AttachmentSchema],
        default: []
    })
    attachments: Attachment[];

    @Prop({ type: Types.ObjectId, ref: 'Message', default: null })
    replyTo?: Types.ObjectId; // reply message

    @Prop({ type: [ReactionSchema], default: [] })
    reactions: Reaction[];

    @Prop({ type: [SeenBySchema], default: [] })
    seenBy: SeenBy[];

    @Prop({ default: false })
    deletedForEveryone: boolean;

    @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
    deletedFor: Types.ObjectId[];

    @Prop({ default: false })
    isEdited: boolean;

    // Metadata for special message types
    @Prop({ type: Object, default: null })
    metadata?: {
        type?: 'video_call' | 'audio_call';
        callStatus?: 'completed' | 'missed' | 'rejected';
        duration?: number; // in seconds
        callId?: string;
    };

    createdAt?: Date;
    updatedAt?: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);