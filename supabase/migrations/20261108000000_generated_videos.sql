-- Assistant-made videos (Sprint 009): a clip and its poster are stored as generated objects, and the clip is
-- the video's draft `video` use. The poster row belongs to the clip's version, like an upload's poster.
ALTER TABLE artifacts.generated_objects DROP CONSTRAINT generated_objects_object_key_check;
ALTER TABLE artifacts.generated_objects ADD CONSTRAINT generated_objects_object_key_check CHECK (object_key ~ '^(published|posters)/[a-f0-9-]+/[a-f0-9-]+$');
ALTER TABLE artifacts.generated_objects DROP CONSTRAINT generated_objects_content_type_check;
ALTER TABLE artifacts.generated_objects ADD CONSTRAINT generated_objects_content_type_check CHECK (content_type IN ('image/png','image/jpeg','video/mp4'));
-- Images and posters stay within 10 MiB; a clip may be up to 100 MiB, the upload limit for videos.
ALTER TABLE artifacts.generated_objects DROP CONSTRAINT generated_objects_byte_size_check;
ALTER TABLE artifacts.generated_objects ADD CONSTRAINT generated_objects_byte_size_check CHECK (byte_size BETWEEN 1 AND (CASE WHEN content_type = 'video/mp4' THEN 104857600 ELSE 10485760 END));
ALTER TABLE artifacts.generated_objects ADD CONSTRAINT generated_posters_are_images CHECK (object_key !~ '^posters/' OR content_type IN ('image/png','image/jpeg'));

-- A generated clip's poster is a generated object too; an upload's poster stays an upload object.
ALTER TABLE artifacts.media_objects ADD COLUMN generated_poster_key text;
ALTER TABLE artifacts.media_objects ADD FOREIGN KEY (owner_id,generated_poster_key) REFERENCES artifacts.generated_objects(owner_id,object_key);
ALTER TABLE artifacts.media_objects ADD CONSTRAINT generated_poster_needs_generated_media CHECK (generated_poster_key IS NULL OR generated_key IS NOT NULL);

-- The assistant's clips: a use only the assistant's save writes (`useVersion` and intended uses can't name it).
ALTER TABLE artifacts.conversation_uses DROP CONSTRAINT conversation_uses_purpose_check;
ALTER TABLE artifacts.conversation_uses ADD CONSTRAINT conversation_uses_purpose_check CHECK (purpose IN ('script','reference','storyboard','panel_image','shot_video','video'));
