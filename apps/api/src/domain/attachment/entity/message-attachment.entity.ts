import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/**
 * message_attachments — files exchanged inside a conversation (PLN-260814).
 *
 * Uploads happen before the message that owns them exists, so `message_id`
 * stays null until the send call attaches it. That window is also what the
 * cleanup batch sweeps: an upload the customer never sent leaves a file on disk
 * that nothing references.
 *
 * Nullable columns carry an explicit `type` — a union TS type without one makes
 * TypeORM infer `Object` and the DataSource fails to initialise at boot
 * (dev-kit lesson A-1).
 */
@Entity('message_attachments')
export class MessageAttachment {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  /** Public identifier. Storage paths and signed URLs use this, never the PK. */
  @Column({ type: 'char', length: 36 })
  @Index('uk_attach_uuid', { unique: true })
  uuid: string;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  @Index('idx_attach_tenant_created')
  tenantId: number;

  /** Null while the session has no conversation yet (first turn carries a file). */
  @Column({
    name: 'conversation_id',
    type: 'bigint',
    nullable: true,
    transformer: bigintTransformer,
  })
  @Index('idx_attach_conv')
  conversationId: number | null;

  /** Null between upload and send — see the class comment. */
  @Column({ name: 'message_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_attach_msg')
  messageId: number | null;

  /** Widget uploads are owned by a session; console uploads leave this null. */
  @Column({ name: 'session_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_attach_session')
  sessionId: number | null;

  @Column({ name: 'uploader_type', type: 'varchar', length: 16 })
  uploaderType: string; // user | agent | system

  @Column({ name: 'uploader_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  uploaderId: number | null;

  /** image → has a thumbnail and renders inline; file → renders as a card. */
  @Column({ type: 'varchar', length: 16 })
  kind: string;

  /** Original name, sanitised for display only — never used to build a path. */
  @Column({ type: 'varchar', length: 255 })
  filename: string;

  /** The type decided by magic-byte sniffing, not the browser's claim. */
  @Column({ type: 'varchar', length: 128 })
  mime: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  size: number;

  @Column({ type: 'int', nullable: true })
  width: number | null;

  @Column({ type: 'int', nullable: true })
  height: number | null;

  /** Relative to UPLOAD_DIR: {tenant}/{YYYYMM}/{uuid}.{ext} */
  @Column({ name: 'storage_path', type: 'varchar', length: 512 })
  storagePath: string;

  /** Relative path of the 320px webp thumbnail; null for non-images and when
   * thumbnailing was unavailable (the console then falls back to the original). */
  @Column({ name: 'thumb_path', type: 'varchar', length: 512, nullable: true })
  thumbPath: string | null;

  @Column({ type: 'char', length: 64, nullable: true })
  checksum: string | null;

  /** widget | console | telegram | viber | hub | gmail — where the file came from. */
  @Column({ type: 'varchar', length: 24, default: 'widget' })
  source: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
