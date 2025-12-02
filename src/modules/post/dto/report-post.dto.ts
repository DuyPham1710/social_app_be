

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReportPostDto {
  @ApiProperty({
    description: 'Lý do báo cáo bài viết',
    example: 'Nội dung phản cảm / vi phạm tiêu chuẩn cộng đồng',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason: string;

  @ApiProperty({
    description: 'Mô tả chi tiết hơn về lý do báo cáo',
    required: false,
    example: 'Bài viết chứa hình ảnh bạo lực...',
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;
}


