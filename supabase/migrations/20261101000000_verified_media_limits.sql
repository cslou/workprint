-- Additive application-only admission update; image/lease/immutability guards stay intact.
ALTER TABLE artifacts.uploads DROP CONSTRAINT uploads_byte_size_check;
ALTER TABLE artifacts.uploads ADD CONSTRAINT uploads_byte_size_check
  CHECK (byte_size > 0 AND byte_size <= 104857600);
