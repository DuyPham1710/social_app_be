import { 
  Body, 
  Controller, 
  Delete, 
  Param, 
  Post, 
  Put, 
  Req, 
  UseGuards 
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ReactPostService } from './react-post.service';
import { CreateReactPostDto } from './dto/create-react-post.dto';
import { UpdateReactPostDto } from './dto/update-react-post.dto';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('react-post')
export class ReactPostController {
  constructor(private readonly reactPostService: ReactPostService) {}

  // Thả reaction (nếu đã tồn tại thì update emoji)
  @Post()
  create(@Req() req: any, @Body() dto: CreateReactPostDto) {
    const userId = req.user.userId;
    return this.reactPostService.create({ ...dto, userId });
  }

  // Update reaction (chỉ đổi emoji)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateReactPostDto) {
    return this.reactPostService.update(id, dto);
  }

  // Xoá reaction (check user từ token)
  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.userId;
    return this.reactPostService.remove(id, userId);
  }
}
