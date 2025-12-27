import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class UpdateConversationDto {
    @IsString()
    @IsOptional()
    name?: string; // Đổi tên group

    @IsString()
    @IsOptional()
    avatar?: string; // Đổi avatar group

    @IsString()
    @IsOptional()
    createdBy?: string; // Đổi người tạo group

    @IsArray()
    @IsOptional()
    participantIds?: string[]; // Thêm thành viên mới
}