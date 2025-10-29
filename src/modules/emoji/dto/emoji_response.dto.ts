import { Types } from "mongoose";

export interface EmojiResponseDto {
    _id: Types.ObjectId;
    label: string;
    icon: string;
}
