import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { EmojiService } from './emoji.service';
import { CreateEmojiDto } from './dto/create-emoji.dto';
import { UpdateEmojiDto } from './dto/update-emoji.dto';

@Controller('emoji')
export class EmojiController {
  constructor(private readonly emojiService: EmojiService) {}

  @Get()
  async getAll() {
    return this.emojiService.findAll();
  }
}
