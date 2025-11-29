
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";

@Schema()
export class Reaction {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    userId: Types.ObjectId;

    // @Prop({ required: true })
    // reaction: string; // ❤️ 👍 😢 etc
    @Prop({ type: Types.ObjectId, ref: 'Emoji', required: true })
    emojiId: Types.ObjectId;
}

export const ReactionSchema = SchemaFactory.createForClass(Reaction);
