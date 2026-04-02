import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { SaveService } from './save.service';
import { CreateSaveDto } from './dto/create-save.dto';

@ApiBearerAuth()
@ApiTags('Save')
@UseGuards(JwtAuthGuard)
@Controller('save')
export class SaveController {
  constructor(private readonly saveService: SaveService) {}

  // Lưu bài post/reel/comment
  @Post()
  @ApiBody({ type: CreateSaveDto })
  save(@Req() req, @Body() dto: CreateSaveDto) {
    const userId = req.user.userId;
    return this.saveService.save(userId, dto);
  }

  // Bỏ lưu
  @Delete(':id')
  unsave(
    @Req() req,
    @Param('id') id: string,
  ) {
    const userId = req.user.userId;
    return this.saveService.unsave(userId, id);
  }

  // Lấy danh sách đã lưu của user hiện tại
  @Get()
  @ApiQuery({ name: 'type', required: false, enum: ['post', 'reel', 'comment'] })
  @ApiQuery({ name: 'collection', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getMySaved(
    @Req() req,
    @Query('type') type?: string,
    @Query('collection') collection?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const userId = req.user.userId;
    return this.saveService.getSavedByUser(userId, type, collection, page, limit);
  }

  // Kiểm tra đã lưu chưa
  @Get('check/:targetId/:type')
  checkSaved(
    @Req() req,
    @Param('targetId') targetId: string,
    @Param('type') type: string,
  ) {
    const userId = req.user.userId;
    return this.saveService.isSaved(userId, targetId, type);
  }

  // Đếm số lượt lưu của 1 target
  @Get('count/:targetId/:type')
  countSaves(
    @Param('targetId') targetId: string,
    @Param('type') type: string,
  ) {
    return this.saveService.countSaves(targetId, type);
  }
}
