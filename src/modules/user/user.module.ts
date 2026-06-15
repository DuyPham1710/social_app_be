import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { SearchHistory, SearchHistorySchema } from './schemas/search-history.schema';
import { UserReport, UserReportSchema } from './schemas/user-report.schema';
import { AdminInitializerService } from './admin-initializer.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: SearchHistory.name, schema: SearchHistorySchema },
      { name: UserReport.name, schema: UserReportSchema }
    ])
  ],
  controllers: [UserController],
  providers: [UserService, AdminInitializerService],
  exports: [UserService, AdminInitializerService],
})
export class UserModule { }
