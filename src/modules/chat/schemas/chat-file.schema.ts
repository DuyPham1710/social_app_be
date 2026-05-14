import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type ChatFileDocument = ChatFile & Document;

@Schema({ timestamps: true })
export class ChatFile {
    @Prop({ required: true })
    filename: string;

    @Prop({ required: true })
    mimetype: string;

    @Prop({ required: true })
    data: Buffer;

    @Prop({ required: true })
    size: number;
}

export const ChatFileSchema = SchemaFactory.createForClass(ChatFile);
