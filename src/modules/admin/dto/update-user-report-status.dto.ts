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
