import { IsNotEmpty, IsString } from 'class-validator';

export class ReactMessageDto {
    @IsString()
    @IsNotEmpty()
    messageId: string;

    @IsString()
    @IsNotEmpty()
    emojiId: string; // ID của emoji từ Emoji schema
}

