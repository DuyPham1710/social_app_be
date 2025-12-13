import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CallHistoryDocument = CallHistory & Document;

@Schema({ timestamps: true })
export class CallHistory {
    @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
    callerId: Types.ObjectId;

    @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], required: true })
    participantIds: Types.ObjectId[];

    @Prop({ required: true })
    channelId: string;

    @Prop({ required: true, enum: ['video', 'audio'] })
    callType: string;

    @Prop({ type: Types.ObjectId, ref: 'Conversation', required: false })
    conversationId?: Types.ObjectId;

    @Prop({ required: true, enum: ['initiated', 'ringing', 'answered', 'rejected', 'ended', 'missed'], default: 'initiated' })
    status: string;

    @Prop({ required: false })
    startedAt?: Date;

    @Prop({ required: false })
    endedAt?: Date;

    @Prop({ required: false })
    duration?: number; // in seconds
}

export const CallHistorySchema = SchemaFactory.createForClass(CallHistory);

