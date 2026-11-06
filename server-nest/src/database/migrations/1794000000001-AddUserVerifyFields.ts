import { MigrationInterface, QueryRunner } from 'typeorm';

/** 注册手机/邮箱验证：手机号仅内部合规校验，不进入公开用户资料。 */
export class AddUserVerifyFields1794000000001 implements MigrationInterface {
  name = 'AddUserVerifyFields1794000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE `users` ADD `phone` varchar(20) NULL");
    await queryRunner.query(
      "ALTER TABLE `users` ADD `phone_verified` smallint NOT NULL DEFAULT 0",
    );
    await queryRunner.query(
      "ALTER TABLE `users` ADD `email_verified` smallint NOT NULL DEFAULT 0",
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX `IDX_users_phone` ON `users` (`phone`)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX `IDX_users_phone` ON `users`');
    await queryRunner.query('ALTER TABLE `users` DROP COLUMN `email_verified`');
    await queryRunner.query('ALTER TABLE `users` DROP COLUMN `phone_verified`');
    await queryRunner.query('ALTER TABLE `users` DROP COLUMN `phone`');
  }
}
