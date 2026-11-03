-- A video job made from reference images (Sprint 012) saves its images as its inputs: up to 9, MiniMax's limit for
-- reference images, where a frame job saves its 1 or 2 frames. The inputs stay fixed once saved.
ALTER TABLE generation.requests DROP CONSTRAINT requests_inputs_check,
  ADD CONSTRAINT requests_inputs_check CHECK (cardinality(inputs) <= 9 AND array_position(inputs, NULL) IS NULL);
