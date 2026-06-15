import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class DebugClassifyCaptionDto {
    @ApiProperty({ example: 'Hôm nay đi Đà Lạt với bạn bè rất vui' })
    @IsString()
    caption: string;
}
