import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * MySQL (utf8mb4 / InnoDB) — matches design/chat-widget-schema.sql.
 * Dev: synchronize=true; staging/prod must use manual SQL migration (sql/).
 */
export function buildTypeOrmOptions(config: ConfigService): TypeOrmModuleOptions {
  return {
    type: 'mysql',
    host: config.get<string>('DB_HOST', '127.0.0.1'),
    port: config.get<number>('DB_PORT', 3306),
    username: config.get<string>('DB_USER', 'ivy'),
    password: config.get<string>('DB_PASSWORD', ''),
    database: config.get<string>('DB_NAME', 'db_ivy_talktalk'),
    charset: 'utf8mb4',
    timezone: 'Z',
    autoLoadEntities: true,
    synchronize: config.get<string>('DB_SYNCHRONIZE') === 'true',
    logging: config.get<string>('DB_LOGGING') === 'true',
    // Tolerate slow/flaky DB availability on local dev (e.g. Docker Desktop warm-up).
    retryAttempts: 40,
    retryDelay: 3000,
  };
}
