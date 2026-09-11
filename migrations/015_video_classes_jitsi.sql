SET NAMES utf8mb4;

ALTER TABLE video_classes
  MODIFY COLUMN meeting_link VARCHAR(500) NULL,
  ADD COLUMN mode ENUM('external', 'jitsi') NOT NULL DEFAULT 'external' AFTER meeting_link,
  ADD COLUMN room_name VARCHAR(100) NULL AFTER mode;
