import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PrivacyService } from './privacy.service';
import { PrivacyController } from './privacy.controller';
import { Privacy, PrivacySchema } from './schemas/privacy.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Privacy.name, schema: PrivacySchema }]),
  ],
  controllers: [PrivacyController],
  providers: [PrivacyService],
  exports: [PrivacyService],
})
export class PrivacyModule { }
