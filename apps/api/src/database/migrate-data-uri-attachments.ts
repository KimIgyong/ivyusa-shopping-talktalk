import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Message } from '../domain/chat/entity/message.entity';
import { Conversation } from '../domain/chat/entity/conversation.entity';
import { AttachmentService } from '../domain/attachment/attachment.service';
import { parseDataUri } from '../domain/messenger/adapter/data-uri.util';
import { DataSource } from 'typeorm';

/**
 * One-time backfill for FIX-260817: messages whose whole body is a `data:` URI.
 *
 * Before the relay adapter learned to split them, every KakaoTalk photo was
 * stored as ~50KB of base64 in `messages.body`. Two consequences the console
 * shows: the agent sees a wall of text instead of the photo, and the message
 * list ships those 50KB per turn on every open.
 *
 * Each row is converted into a real attachment — same path as a live upload, so
 * the file gets a thumbnail, EXIF stripping and a signed URL — and the body is
 * emptied. Idempotent: a row whose body no longer parses as a data URI is
 * skipped, so re-running only picks up what is left.
 *
 * Run inside the API container (it needs UPLOAD_DIR and the DB):
 *   node dist/database/migrate-data-uri-attachments.js [--dry-run] [--limit=N]
 */
const BATCH = 25;

interface Stats {
  scanned: number;
  converted: number;
  skipped: number;
  failed: number;
  bytesFreed: number;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const rawLimit = limitArg?.slice('--limit='.length);
  // `--limit=abc` would be NaN, every comparison against it false, and the
  // operator who asked for a careful ten rows would get the whole table.
  if (rawLimit !== undefined && !/^[1-9]\d*$/.test(rawLimit)) {
    throw new Error(`--limit must be a positive integer, got '${rawLimit}'`);
  }
  const limit = rawLimit === undefined ? Infinity : Number(rawLimit);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const ds = app.get(DataSource);
  const attachments = app.get(AttachmentService);
  const messageRepo = ds.getRepository(Message);
  const conversationRepo = ds.getRepository(Conversation);

  const stats: Stats = { scanned: 0, converted: 0, skipped: 0, failed: 0, bytesFreed: 0 };
  let lastId = 0;

  try {
    for (;;) {
      if (stats.scanned >= limit) break;
      const rows = await messageRepo
        .createQueryBuilder('m')
        .where('m.id > :lastId', { lastId })
        .andWhere('m.body LIKE :prefix', { prefix: 'data:%' })
        .orderBy('m.id', 'ASC')
        .take(BATCH)
        .getMany();
      if (!rows.length) break;

      for (const row of rows) {
        lastId = Number(row.id);
        stats.scanned++;
        if (stats.scanned > limit) break;

        const parsed = parseDataUri((row.body ?? '').trim());
        if (!parsed) {
          stats.skipped++;
          continue;
        }

        // A previous run may have stored the file and then failed before the
        // body was cleared. Converting again would leave the message with two
        // copies of the same photo, so finish that run instead of repeating it.
        const already = await attachments.findByMessageIds([Number(row.id)]);
        if (already.get(String(row.id))?.length) {
          if (!dryRun) await messageRepo.update({ id: Number(row.id) }, { body: '' });
          console.log(`message ${row.id}: already had an attachment — body cleared only`);
          stats.skipped++;
          continue;
        }

        const conversation = await conversationRepo.findOne({
          where: { id: Number(row.conversationId) },
        });
        if (!conversation) {
          console.warn(`message ${row.id}: conversation ${row.conversationId} is gone — skipped`);
          stats.skipped++;
          continue;
        }

        const ext = parsed.mime.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin';
        if (dryRun) {
          console.log(
            `[dry-run] message ${row.id} (conv ${row.conversationId}): ` +
              `${parsed.mime}, ${(parsed.data.length / 1024).toFixed(0)}KB → photo-${row.id}.${ext}`,
          );
          stats.converted++;
          stats.bytesFreed += (row.body ?? '').length;
          continue;
        }

        try {
          const saved = await attachments.store(
            {
              originalname: `photo-${row.id}.${ext}`,
              mimetype: parsed.mime,
              size: parsed.data.length,
              buffer: parsed.data,
            },
            {
              tenantId: Number(conversation.tenantId),
              conversationId: Number(row.conversationId),
              sessionId: null,
              uploaderType: 'user',
              uploaderId: null,
              source: 'btbz_relay',
            },
          );
          const claimed = await attachments.attachToMessage([saved.uuid], {
            tenantId: Number(conversation.tenantId),
            messageId: Number(row.id),
            conversationId: Number(row.conversationId),
          });
          if (!claimed.length) {
            // The file is stored but bound to nothing. Remove it now rather than
            // leaving bytes on disk that no message will ever point at.
            await attachments.deleteByIds([Number(saved.id)]);
            throw new Error('attachment could not be bound to the message');
          }
          // The bytes now live on disk; leaving the base64 in the body would
          // keep shipping it to the console on every conversation open.
          stats.bytesFreed += (row.body ?? '').length;
          await messageRepo.update({ id: Number(row.id) }, { body: '' });
          stats.converted++;
        } catch (e) {
          // A photo we cannot decode keeps its body: losing the evidence would
          // be worse than the wall of base64 it currently shows.
          console.warn(`message ${row.id}: ${(e as Error).message} — left as-is`);
          stats.failed++;
        }
      }

      console.log(
        `… scanned ${stats.scanned}, converted ${stats.converted}, ` +
          `skipped ${stats.skipped}, failed ${stats.failed}`,
      );
    }

    console.log(
      `\n${dryRun ? '[dry-run] ' : ''}done — scanned ${stats.scanned}, converted ${stats.converted}, ` +
        `skipped ${stats.skipped}, failed ${stats.failed}, ` +
        `${(stats.bytesFreed / 1024 / 1024).toFixed(1)}MB of base64 removed from message bodies`,
    );
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('data-uri backfill failed:', err);
  process.exit(1);
});
