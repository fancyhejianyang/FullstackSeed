import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateApprovalRequests1788854400000 implements MigrationInterface {
  name = 'CreateApprovalRequests1788854400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "CREATE TABLE `approval_requests` (`id` int NOT NULL AUTO_INCREMENT, `businessType` varchar(40) NOT NULL, `businessId` int NOT NULL, `businessTitle` varchar(200) NOT NULL, `status` varchar(20) NOT NULL DEFAULT 'pending', `applicantId` int NOT NULL, `applicantName` varchar(120) NOT NULL, `submittedAt` datetime NOT NULL, `reviewerId` int NULL, `reviewerName` varchar(120) NULL, `reviewedAt` datetime NULL, `remark` text NULL, `contentSnapshot` longtext NOT NULL, `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, `deletedAt` datetime NULL, INDEX `IDX_approval_request_business_type` (`businessType`), INDEX `IDX_approval_request_business_id` (`businessId`), INDEX `IDX_approval_request_status` (`status`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `approval_requests`');
  }
}
