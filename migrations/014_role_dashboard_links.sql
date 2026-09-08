SET NAMES utf8mb4;

ALTER TABLE teachers
  ADD COLUMN user_id CHAR(36) NULL AFTER institution_id,
  ADD CONSTRAINT fk_teachers_user FOREIGN KEY (user_id) REFERENCES user_profiles (id) ON DELETE SET NULL,
  ADD UNIQUE KEY uq_teachers_user_id (user_id);

ALTER TABLE students
  ADD COLUMN user_id CHAR(36) NULL AFTER institution_id,
  ADD COLUMN parent_user_id CHAR(36) NULL AFTER user_id,
  ADD CONSTRAINT fk_students_user FOREIGN KEY (user_id) REFERENCES user_profiles (id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_students_parent_user FOREIGN KEY (parent_user_id) REFERENCES user_profiles (id) ON DELETE SET NULL,
  ADD UNIQUE KEY uq_students_user_id (user_id),
  ADD KEY idx_students_parent_user_id (parent_user_id);
