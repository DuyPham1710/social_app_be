import { IsNotEmpty, IsString, IsBoolean } from 'class-validator';

export class DeleteMessageDto {
    @IsString()
    @IsNotEmpty()
    messageId: string;

    @IsBoolean()
    deleteForEveryone: boolean; // true: xóa cho mọi người, false: xóa cho tôi
}

