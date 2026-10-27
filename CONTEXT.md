# Workprint — Production Terminology

This context defines the canonical language currently needed to discuss the studio's production and review model. Terms are added only after concrete scenarios establish a useful distinction; medium-specific terminology remains outside this file until researched.

An `_Avoid_` entry names a misleading substitute for the defined term. It does not ban the word when it refers to its own distinct concept.

Qualify overloaded digital terms whenever the distinction matters: for example, Comfy Workflow Graph, ML Model Weights, Diffusion Checkpoint File, Text Prompt, Generation Request, Workflow Run, Render-Farm Job, Artifact Manifest, Provenance Record, Final Delivery Master, Editorial Proxy Media, Property Keyframe, and Animation Key Pose.

## Creative and Production Structure

**Creative Work**:
An identifiable creative entity intended for production or release, independent of any one production effort or displayed name.
_Example_: An animated adaptation that receives episodic and localized releases
_Avoid_: Title, project

**Title**:
A displayed or working name assigned to a Creative Work, potentially qualified by language, territory, or purpose.
_Example_: The English release title differs from the original-language title
_Avoid_: Creative Work

**Project**:
A bounded production effort that creates or revises all or part of one or more Creative Works.
_Example_: One project produces a pilot; a later project creates its localization
_Avoid_: Creative Work, title

**Season**:
A named or numbered grouping of Episodes within a serial Creative Work.
_Example_: Season 1 groups Episodes 1 through 8
_Avoid_: Project

**Episode**:
An independently consumable installment of a serial Creative Work.
_Example_: Episode 3 has distinct production and release numbers
_Avoid_: Season, project

## Narrative and Picture Structure

**Narrative Sequence**:
A grouping of Shots or Narrative Scenes connected by dramatic or action intent.
_Example_: An escape sequence moves from a kitchen confrontation into a street chase
_Avoid_: VFX sequence, animation sequence

**Narrative Scene**:
A dramatic unit organized around a continuous situation, commonly a shared location, time, or action.
_Example_: Two characters argue in the kitchen at night
_Avoid_: Shot, 3D scene, authoring-tool scene

**Story Beat**:
A meaningful change, decision, discovery, or turn in the story.
_Example_: The character discovers that the key is missing
_Avoid_: Timing beat, musical beat

**Shot**:
A bounded uninterrupted visual and editorial unit.
_Example_: One close-up running from one cut point to the next
_Avoid_: Narrative Scene, clip

**Frame**:
One temporal image position in moving media.
_Example_: Frame 48 of a Shot presented at 24 frames per second
_Avoid_: Storyboard Panel, Property Keyframe

**Storyboard Panel**:
One storyboard image representing a view or important moment; several panels may describe one Shot.
_Example_: Three panels show the camera moving through one uninterrupted Shot
_Avoid_: Frame, Shot

## Production Records

**Artifact**:
An identifiable production work product created or used while making an animated work.
_Examples_: Script draft, character turnaround, animatic, dialogue recording, edited sequence
_Avoid_: File, output

**Artifact Version**:
A particular state of an artifact used as the subject of a dependency, handoff, or review.
_Examples_: Character turnaround v3, revised animatic v2, approved dialogue take v5
_Avoid_: Latest, final

**Asset**:
An artifact managed for reuse across production contexts.
_Examples_: Character design, reusable location design, prop design, animation rig
_Avoid_: Resource

**Deliverable**:
An artifact or set of artifact versions assigned to a specific handoff or delivery obligation.
_Examples_: Approved animatic handed to shot production, final master supplied for release
_Avoid_: Output

## Review and Change

**Approval**:
A decision that applies to a specific artifact version, stated review concerns, and an intended use context.
_Example_: Character turnaround v3 is approved as the identity and costume reference for the kitchen close-up
_Avoid_: Finalization, blanket approval

**Review Bundle**:
A context-specific selection of exact artifact versions presented together for one review.
_Example_: Layout v2, character variant v4, and environment reference v1 reviewed together for the kitchen close-up
_Avoid_: Gate

**Approval Gate**:
A production checkpoint whose stated review and readiness conditions must be satisfied before affected work advances.
_Example_: The animatic gate requires approved story clarity, coverage, and timing before shot production starts
_Avoid_: Review bundle

**Dependency**:
A relationship in which a change to one artifact may affect the correctness or approval of another.
_Example_: A shot's target image depends on the character-variant version it depicts
_Avoid_: Link

**Revalidation**:
A repeated assessment of an artifact after a relevant dependency or use context changes.
_Example_: After a jacket emblem changes, existing target images that depict it are checked again
_Avoid_: Regeneration

## Process and Generation

**Production Process**:
The end-to-end arrangement of creative work, handoffs, reviews, revisions, and deliveries used to make an animated work.
_Example_: Adapting a chapter through story planning, animatic, shot production, editing, finishing, and delivery
_Avoid_: Workflow, pipeline

**Generative Workflow**:
A repeatable procedure that transforms declared inputs into generated outputs using models or other computational tools.
_Example_: Producing candidate motion clips from an approved target frame and declared motion controls
_Avoid_: Workflow
