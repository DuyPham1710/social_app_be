import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUserReportStatusDto {
  @ApiProperty({
    enum: ['pending', 'reviewed', 'rejected'],
    description: 'Trạng thái xử lý báo cáo người dùng',
    example: 'reviewed',
  })
  @IsEnum(['pending', 'reviewed', 'rejected'] as any)
  status: 'pending' | 'reviewed' | 'rejected';

  @ApiProperty({
    required: false,
    description: 'Ghi chú nội bộ cho admin (không bắt buộc)',
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  note?: string;
}
