SET NAMES utf8mb4;

ALTER TABLE students ADD COLUMN photo_url VARCHAR(500) NULL AFTER address;
ALTER TABLE teachers ADD COLUMN photo_url VARCHAR(500) NULL AFTER qualification;
ALTER TABLE visitors ADD COLUMN photo_url VARCHAR(500) NULL AFTER whom_to_meet;
