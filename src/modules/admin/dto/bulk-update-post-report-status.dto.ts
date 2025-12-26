import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, MaxLength, ArrayMinSize } from 'class-validator';

export class BulkUpdatePostReportStatusDto {
  @ApiProperty({
    type: [String],
    description: 'Danh sách ID của các báo cáo cần cập nhật',
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
  })
  @IsArray()
  @ArrayMinSize(1)
  reportIds: string[];

  @ApiProperty({
    enum: ['pending', 'reviewed', 'rejected'],
    description: 'Trạng thái xử lý báo cáo',
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


