import { Injectable } from '@nestjs/common';
import { CreateEmojiDto } from './dto/create-emoji.dto';
import { UpdateEmojiDto } from './dto/update-emoji.dto';

@Injectable()
export class EmojiService {
  create(createEmojiDto: CreateEmojiDto) {
    return 'This action adds a new emoji';
  }

  findAll() {
    return `This action returns all emoji`;
  }

  findOne(id: number) {
    return `This action returns a #${id} emoji`;
  }

  update(id: number, updateEmojiDto: UpdateEmojiDto) {
    return `This action updates a #${id} emoji`;
  }

  remove(id: number) {
    return `This action removes a #${id} emoji`;
  }
}
