import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 动态信息来源：来源地址 + 原作者。
 * 只加两列、都有默认值，对存量数据无破坏；线上 DB_SYNCHRONIZE=false 时由迁移执行。
 */
export class AddPostSource1792500000000 implements MigrationInterface {
  name = 'AddPostSource1792500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `posts` ADD `source_url` varchar(500) NOT NULL DEFAULT ''",
    );
    await queryRunner.query(
      "ALTER TABLE `posts` ADD `source_author` varchar(100) NOT NULL DEFAULT ''",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `posts` DROP COLUMN `source_author`');
    await queryRunner.query('ALTER TABLE `posts` DROP COLUMN `source_url`');
  }
}
