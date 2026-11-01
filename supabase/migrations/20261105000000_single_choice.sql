-- One approved Panel-image or Shot-video choice per exact target, independent of writer locking.
CREATE UNIQUE INDEX one_approved_choice ON artifacts.conversation_uses(owner_id, conversation_id, binding)
  WHERE state = 'approved' AND purpose IN ('panel_image', 'shot_video');
