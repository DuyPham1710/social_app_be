import { Injectable } from '@nestjs/common';
import { CreateEmojiDto } from './dto/create-emoji.dto';
import { UpdateEmojiDto } from './dto/update-emoji.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Emoji, EmojiDocument } from './schemas/emoji.schema';
@Injectable()
export class EmojiService {
  constructor(@InjectModel(Emoji.name) private emojiModel: Model<EmojiDocument>) {}

  async findAll() {
    return this.emojiModel.find({ isActive: true }).exec();
  }
}
