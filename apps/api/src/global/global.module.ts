import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

/**
 * Global module exposing JwtModule (signing + verification) used by guards and
 * the auth service. Access tokens are short-lived (JWT_ACCESS_TTL).
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: Number(config.get<string>('JWT_ACCESS_TTL', '900')) },
      }),
    }),
  ],
  exports: [JwtModule],
})
export class GlobalModule {}
