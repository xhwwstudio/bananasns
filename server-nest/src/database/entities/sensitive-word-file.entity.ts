import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 站长上传的敏感词文件。content 存去重后的词表（每行一个），
 * enabled=0 时只展示、不参与过滤，避免误传 stopword.dic 直接把正常标点全拦掉。
 */
@Entity('sensitive_word_files')
export class SensitiveWordFile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  filename: string;

  @Column({ name: 'word_count', type: 'int', default: 0 })
  word_count: number;

  @Column({ type: 'longtext' })
  content: string;

  @Index()
  @Column({ type: 'smallint', default: 0 })
  enabled: number;

  @Column({ name: 'created_at', type: 'varchar', length: 32 })
  created_at: string;
}
