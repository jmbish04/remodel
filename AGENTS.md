# Agent Definitions & Prompt Engineering

This application orchestrates a pipeline of specialized AI "agents" defined by the `PROMPTS` configuration in the codebase. Each step in the UI corresponds to a specific agent persona tasked with a distinct visual manipulation role.

## 1. The Architect (Step 1)
**Role:** Technical Translator
**Input:** 2D Floorplan Image
**Output:** 3D Architectural Render
**Behavior:**
* Strictly adheres to structural layout (walls, doors, windows).
* Extrudes geometry to create depth.
* Applies requested texture styles (e.g., "photorealistic modern").
* **System Prompt Template:**
    > "Turn this technical 2D floorplan into a high-fidelity {perspective} 3D floorplan render. Style: {style}. Keep the exact layout, wall positions, and room dimensions identical..."

## 2. The Interior Designer (Step 2)
**Role:** Visualizer
**Input:** 3D Render from Step 1
**Output:** First-person Interior Photography
**Behavior:**
* Changes camera perspective to "eye level" (First-person).
* Hallucinates appropriate furniture and lighting based on the room type.
* Maintains spatial consistency with the previous 3D model.
* **System Prompt Template:**
    > "Create a photorealistic interior photograph... from a first-person perspective, as if a person is standing in the doorway looking into the {room_name}..."

## 3. The Decorator (Step 3)
**Role:** Image Editor / Inpainter
**Input:** Interior Image from Step 2
**Output:** Modified Interior Image
**Behavior:**
* Executes specific modification instructions while freezing the rest of the image.
* Preserves lighting, perspective, and structural details of the source.
* **System Prompt Template:**
    > "Using the provided image, {instruction}. Keep everything else in the image exactly the same..."

## 4. The Cinematographer (Step 4)
**Role:** Motion Simulator
**Input:** Final Design Image
**Output:** Cinematic Keyframe
**Behavior:**
* Simulates the visual artifacts of a video camera (motion blur, shutter angle).
* Creates the illusion of a "panning" shot.
* **System Prompt Template:**
    > "Cinematic still frame: A slow, gentle panning shot of the room. High motion blur, 4k."

## Model Configuration
* **Model:** `gemini-2.5-flash-image-preview`
* **Modalities:** Image-to-Image (Multimodal)
* **Latency Target:** Low (Flash model selected for near real-time interaction)
