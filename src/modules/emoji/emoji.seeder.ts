import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Emoji, EmojiDocument } from './schemas/emoji.schema';

@Injectable()
export class EmojiSeeder implements OnModuleInit {
  constructor(
    @InjectModel(Emoji.name) private emojiModel: Model<EmojiDocument>,
  ) { }

  async onModuleInit() {
    const count = await this.emojiModel.countDocuments();
    if (count === 0) {
      await this.emojiModel.insertMany([
        { label: 'like', icon: '👍' },
        { label: 'love', icon: '❤️' },
        { label: 'haha', icon: '😂' },
        { label: 'wow', icon: '😮' },
        { label: 'sad', icon: '😢' },
        { label: 'angry', icon: '😡' },
      ]);
      console.log('✅ Seeded emojis successfully');
    }
  }
}
