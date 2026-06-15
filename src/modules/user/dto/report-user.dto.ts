import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReportUserDto {
  @ApiProperty({
    description: 'Lý do báo cáo người dùng',
    example: 'Spam, quấy rối, tài khoản giả mạo, nội dung không phù hợp...',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason: string;

  @ApiProperty({
    description: 'Mô tả chi tiết hơn về lý do báo cáo',
    required: false,
    example: 'Tài khoản này liên tục gửi tin nhắn rác hoặc đăng tải thông tin sai sự thật...',
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;
}
