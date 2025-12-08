import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { AttachmentType } from "src/shared/enums/Attachment_type";

@Schema()
export class Attachment {
    @Prop({ required: true })
    url: string;

    @Prop({
        required: true,
        enum: AttachmentType,
    })
    type: AttachmentType;

    @Prop({ required: true })
    size: number;
}

export const AttachmentSchema = SchemaFactory.createForClass(Attachment);
