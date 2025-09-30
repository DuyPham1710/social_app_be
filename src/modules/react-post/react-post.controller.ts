import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ReactPostService } from './react-post.service';
import { CreateReactPostDto } from './dto/create-react-post.dto';
import { UpdateReactPostDto } from './dto/update-react-post.dto';

@Controller('react-post')
export class ReactPostController {
  constructor(private readonly reactPostService: ReactPostService) {}

  @Post()
  create(@Body() createReactPostDto: CreateReactPostDto) {
    return this.reactPostService.create(createReactPostDto);
  }

  @Get()
  findAll() {
    return this.reactPostService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reactPostService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateReactPostDto: UpdateReactPostDto) {
    return this.reactPostService.update(+id, updateReactPostDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.reactPostService.remove(+id);
  }
}
