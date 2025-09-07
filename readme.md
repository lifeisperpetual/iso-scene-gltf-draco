# Isometric GLTF Scene — Three.js + Vite

An interactive, isometric 3D scene powered by Three.js and Vite. It showcases a DRACO‑compressed GLTF model, a polished page loader, a quick-start navigation overlay, smooth camera focus and zoom, day/night lighting modes, interactive hover groups, a clickable lamp with emissive glow and point light, and a mesh with a looping video texture applied.

> Built with Vite for fast dev and modern builds. Designed for easy customization.

---

## Features
- Elegant page loader overlay with animated progress bar
- In-app Navigation overlay with tips (click “Got it” to close)
- Day/Night lighting modes with animated color/intensity transitions
- Smooth orbit controls with custom buttery scroll zoom
- Double-click to focus/zoom on any object (bounding-box fit)
- Hover tooltip listing children for the hovered object
- Group hover scaling for named sets of meshes
- Clickable lamp: toggles emissive glow and an attached point light
- GLTF loading with DRACO decompression
- Video texture mapped to a target mesh (screen-like effect)
- GUI panel (lil‑gui) with runtime sizing controls and lighting/animation tools

---

## Tech Stack
- Three.js `^0.174.0`
- Vite `^6`
- GSAP `^3`
- lil‑gui `^0.18`
- DRACO loader (Three examples)
- vite-plugin-restart, vite-plugin-glsl

See `package.json` for exact versions.

---

## Quick Start

Prerequisites:
- Node.js 18+ recommended

Install and run:

```bash
# Install dependencies (first time)
npm install

# Start dev server
npm run dev

# Build for production (outputs to dist/)
npm run build
```

Vite config highlights (`vite.config.js`):
- `root: 'src/'`
- `publicDir: '../static/'` (assets like `*.glb`, `*.mp4`, `draco/*`)
- `base: './'` for relative asset paths (great for static hosting)

---

## Project Structure
```
Iso-GLTF/
├─ src/                     # App source (Vite root)
│  ├─ index.html            # Canvas + loader + navigation overlay
│  ├─ script.js             # Three.js scene and interactions
│  ├─ style.css             # Loader + overlay + canvas styles
│  └─ expo.js               # Experimental raycasting ideas (not wired by default)
│
├─ static/                  # Public assets (served at site root)
│  ├─ v10.glb               # Main GLTF scene (see script.js)
│  ├─ video.mp4             # Video for screen material
│  └─ draco/                # DRACO decoder (js/wasm)
│
├─ vite.config.js
├─ package.json
└─ readme.md
```

---

## How It Works

Key implementation details in `src/script.js`:

- GLTF + DRACO loading
  - `GLTFLoader` with `DRACOLoader` configured to `dracoLoader.setDecoderPath('draco/')`
  - Loads model: `gltfLoader.load('v10.glb', onLoad, onProgress, onError)`
  - On progress, the page loader bar is driven by actual progress events

- Page Loader + Navigation Overlay
  - Loader is a full-screen overlay (`#pageLoader`) removed after a minimum visible time
  - On hide, a Navigation overlay (`#navOverlay`) fades in with quick tips; dismiss via button

- GUI (lil‑gui)
  - Dedicated “GUI” folder to resize the panel at runtime: width, font size, row/slider height
  - Folders for lights (Ambient/Directional) and a “Switch Modes” toggle for Day/Night

- Lighting Profiles
  - `applyLightingMode(isNight)` smoothly animates:
    - Ambient and Directional light intensity/color/position
    - A window `SpotLight` acting as sun/moon
    - Scene background color
    - Optional: lamp glow auto-toggles for night mode

- Camera + Controls
  - `OrbitControls` with damping; default view leaves room for the GUI
  - Smooth custom scroll zoom with clamps to min/max distance
  - Double‑click focus: frames any object by bounding box and animates camera+target

- Interactions
  - Hover tooltip showing object name and first N children (`updateHoverTooltip()`)
  - Hover groups scale together (configure by mesh names in `hoverGroups`)
  - Lamp system:
    - `lamp.name = 'Cylinder003_2'` resolves to the mesh in the GLTF
    - Toggles emissive color/intensity and an attached `PointLight`

- Video Texture Mapping
  - `applyVideoToMeshByName('Cube007_1', 'video.mp4', { autoplay: true, loop: true, muted: true })`
  - Replaces target mesh’s material with `THREE.MeshBasicMaterial({ map: new THREE.VideoTexture(video) })` for an unlit screen effect

---

## Customize

- Use a different GLTF file
  - Put your file in `static/` and update the loader path in `src/script.js`:
    - `gltfLoader.load('yourModel.glb', ...)`

- Change hover groups
  - Edit the `hoverGroups` array in `src/script.js` with your mesh names

- Change the lamp target
  - Update `lamp.name` to match a mesh/group name in your GLTF

- Point video to a different mesh/file
  - Update the call to `applyVideoToMeshByName(<meshName>, <videoPath>)`

- Tweak GUI defaults
  - The GUI sizing controls live in the “GUI” folder at the top of the panel

---

## Controls
- Orbit with mouse drag
- Smooth Zoom with mouse wheel (custom; native zoom disabled)
- Double‑click any object to focus
- Hover to see object/children tooltip
- Click the lamp mesh to toggle its glow (when present)

Tip: Use the GUI to toggle Day/Night and adjust light parameters.

---

## Troubleshooting
- Video doesn’t play
  - Ensure the video is muted for autoplay (`muted: true`)
  - User gesture may be required on some browsers; click once to start
- Model doesn’t load
  - Confirm your GLB/GLTF is in `static/` (public dir) and the name matches in code
  - DRACO path must be `draco/` relative to the served root (see `vite.config.js` and `dracoLoader.setDecoderPath('draco/')`)
- Black or incorrect video mapping
  - Ensure the target mesh has proper UVs
  - Video textures use `tex.flipY = false` to match GLTF UV convention
- GUI not readable
  - Use the “GUI” folder controls to widen the panel and increase font size/row height

---

## Build & Deploy
- `npm run build` outputs to `dist/`
- `base: './'` enables hosting on any static server or GitHub Pages without extra config
- Serve `dist/` contents via any static host (e.g., Netlify, Vercel, GitHub Pages, S3)

---

## Credits
- Three.js examples for `DRACOLoader` and `OrbitControls`
- `lil‑gui` for the developer UI
- `GSAP` for easing/tweens
