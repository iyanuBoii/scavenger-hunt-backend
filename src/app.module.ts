import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { ProgressModule } from './progress/progress.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ValidatorsModule } from './validators/validators.module';
import { TriviaModule } from './trivia/trivia.module';
import { DailyChallengeModule } from './daily-challenge/daily-challenge.module';
import { PuzzleUnlockModule } from './puzzle-unlock/puzzle-unlock.module';
import { ReferralCodeModule } from './referral-code/referral-code.module';
import { ReviewsModule } from './reviews/reviews.module';
import { ClaimHistoryModule } from './claim-history/claim-history.module';
import { StarknetNewsModule } from './starknet-news/starknet-news.module';
import { EventAnnouncementsModule } from './event-announcements/event-announcements.module';
import { validateEnv } from './config/env.validation';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
      validate: validateEnv,
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DATABASE_HOST'),
        port: Number.parseInt(configService.get('DATABASE_PORT')),
        username: configService.get('DATABASE_USERNAME'),
        password: configService.get('DATABASE_PASSWORD'),
        database: configService.get('DATABASE_NAME'),
        synchronize: configService.get('DATABASE_SYNC') === 'true',
        autoLoadEntities: configService.get('DATABASE_AUTOLOAD') === 'true',
        extra: {
          client_encoding: 'utf8',
        },
      }),
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    UserModule,
    ProgressModule,
    DailyChallengeModule,
    ValidatorsModule,
    TriviaModule,
    PuzzleUnlockModule,
    ReferralCodeModule,
    ReviewsModule,
    ClaimHistoryModule,
    StarknetNewsModule,
    EventAnnouncementsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
