import { MigrationInterface, QueryRunner } from 'typeorm';

/** 敏感词文件上传队列：每个上传文件一行，可单独启停/删除。 */
export class AddSensitiveWordFiles1794000000000 implements MigrationInterface {
  name = 'AddSensitiveWordFiles1794000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`sensitive_word_files\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`filename\` varchar(255) NOT NULL,
        \`word_count\` int NOT NULL DEFAULT 0,
        \`content\` longtext NOT NULL,
        \`enabled\` smallint NOT NULL DEFAULT 0,
        \`created_at\` varchar(32) NOT NULL DEFAULT '',
        PRIMARY KEY (\`id\`),
        KEY \`IDX_sensitive_word_files_enabled\` (\`enabled\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `sensitive_word_files`');
  }
}
