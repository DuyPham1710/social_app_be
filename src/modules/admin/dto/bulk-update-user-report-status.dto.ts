import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, MaxLength, ArrayMinSize } from 'class-validator';

export class BulkUpdateUserReportStatusDto {
  @ApiProperty({
    type: [String],
    description: 'Danh sách ID của các báo cáo người dùng cần cập nhật',
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
  })
  @IsArray()
  @ArrayMinSize(1)
  reportIds: string[];

  @ApiProperty({
    enum: ['pending', 'reviewed', 'rejected'],
    description: 'Trạng thái xử lý báo cáo người dùng',
    example: 'reviewed',
  })
  @IsEnum(['pending', 'reviewed', 'rejected'] as any)
  status: 'pending' | 'reviewed' | 'rejected';

  @ApiProperty({
    required: false,
    description: 'Thời hạn cấm tài khoản người dùng',
  })
  @IsString()
  @IsOptional()
  banUntil?: string;

  @ApiProperty({
    required: false,
    description: 'Lý do cấm tài khoản người dùng',
  })
  @IsString()
  @IsOptional()
  banReason?: string;

}
