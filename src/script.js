import GUI from 'lil-gui'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { gsap } from 'gsap'

/**
 * Base
 */
// Debug
const gui = new GUI({
    width: 300
})

// Runtime-adjustable sizing for lil-gui (JS only)
const guiParams = {
    width: 300,
    fontSize: 14,
    rowHeight: 24,
    sliderHeight: 15
}

// Helper to apply width directly to GUI DOM element
function setGuiWidth(px) {
    const w = Math.max(240, Math.min(1000, Math.floor(px)))
    if (gui && gui.domElement) {
        const el = gui.domElement
        el.style.width = `${w}px`
        el.style.minWidth = `${w}px`
        el.style.maxWidth = `${w}px`
    }
    try { gui.width = w } catch (_) { /* noop */ }
}

function applyGuiStyles(el) {
    if (!el) return
    el.style.fontSize = `${guiParams.fontSize}px`
    el.style.lineHeight = '1.5'
    el.style.zIndex = 1500
    el.querySelectorAll('.title').forEach(t => {
        t.style.fontSize = `${guiParams.fontSize}px`
        t.style.display = 'flex'
        t.style.alignItems = 'center'
    })
    el.querySelectorAll('.controller').forEach(c => {
        c.style.minHeight = `${guiParams.rowHeight}px`
        c.style.lineHeight = `${guiParams.rowHeight}px`
    })
    el.querySelectorAll('.controller .name').forEach(n => {
        n.style.fontSize = `${Math.max(12, guiParams.fontSize - 2)}px`
        n.style.lineHeight = `${guiParams.rowHeight}px`
        n.style.whiteSpace = 'normal'
    })
    el.querySelectorAll('input, select, button').forEach(i => {
        i.style.fontSize = `${Math.max(12, guiParams.fontSize - 2)}px`
        i.style.height = `${Math.max(24, guiParams.rowHeight - 2)}px`
    })
    el.querySelectorAll('.slider').forEach(s => {
        s.style.height = `${guiParams.sliderHeight}px`
    })
    // ensure panel width is applied last
    setGuiWidth(guiParams.width)
}
// Initial apply and observe for changes
applyGuiStyles(gui.domElement)
const guiObserver = new MutationObserver(() => applyGuiStyles(gui.domElement))
guiObserver.observe(gui.domElement, { childList: true, subtree: true })

// GUI folder to control GUI sizing itself
const guiFolder = gui.addFolder('GUI')
guiFolder.add(guiParams, 'width', 300, 900, 10).name('panel width').onChange((v) => setGuiWidth(v))
guiFolder.add(guiParams, 'fontSize', 12, 26, 1).name('font size').onChange(() => applyGuiStyles(gui.domElement))
guiFolder.add(guiParams, 'rowHeight', 24, 64, 1).name('row height').onChange(() => applyGuiStyles(gui.domElement))
guiFolder.add(guiParams, 'sliderHeight', 8, 32, 1).name('slider height').onChange(() => applyGuiStyles(gui.domElement))

// Apply initial width
setGuiWidth(guiParams.width)

// Canvas
const canvas = document.querySelector('canvas.webgl')

// Scene
const scene = new THREE.Scene()
scene.background = new THREE.Color(0xf7fbff)

// Simple hover tooltip for child names
const hoverInfoEl = document.createElement('div')
hoverInfoEl.style.position = 'fixed'
hoverInfoEl.style.pointerEvents = 'none'
hoverInfoEl.style.top = '0px'
hoverInfoEl.style.left = '0px'
hoverInfoEl.style.transform = 'translate(12px, 12px)'
hoverInfoEl.style.padding = '8px 10px'
hoverInfoEl.style.borderRadius = '6px'
hoverInfoEl.style.background = 'rgba(0, 0, 0, 0.7)'
hoverInfoEl.style.color = '#fff'
hoverInfoEl.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'
hoverInfoEl.style.fontSize = '10px'
hoverInfoEl.style.lineHeight = '1.2'
hoverInfoEl.style.maxWidth = '320px'
hoverInfoEl.style.whiteSpace = 'pre-wrap'
hoverInfoEl.style.zIndex = '9999'
hoverInfoEl.style.display = 'none'
document.body.appendChild(hoverInfoEl)

function updateHoverTooltip(event, hoveredObject) {
    if (!hoveredObject) {
        hoverInfoEl.style.display = 'none'
        return
    }
    const children = hoveredObject.children || []
    const names = children.map(c => c.name || c.type).filter(Boolean)

    const lines = []
    lines.push(`Object: ${hoveredObject.name || hoveredObject.type}`)
    if (names.length) {
        lines.push(`Children (${names.length}):`)
        // Show up to 20 entries to keep it readable
        const max = 20
        const shown = names.slice(0, max)
        shown.forEach(n => lines.push(`- ${n}`))
        if (names.length > max) lines.push(`… and ${names.length - max} more`)
    } else {
        lines.push('Children: (none)')
    }

    hoverInfoEl.textContent = lines.join('\n')
    hoverInfoEl.style.display = 'block'
    hoverInfoEl.style.left = `${event.clientX}px`
    hoverInfoEl.style.top = `${event.clientY}px`
}

// Picking helpers
const raycaster = new THREE.Raycaster()
const mouse = new THREE.Vector2()
const selectableMeshes = []

// Animation system state
let modelRoot = null
let mixer = null
let gltfClips = []
let currentAction = null

// Hover groups: scale sets of meshes together on hover (by names)
const hoverGroups = [
    { names: ['Plane001_1', 'Plane001_2'], targets: [], active: false },
    { names: ['Cylinder005', 'Cylinder005_1'], targets: [], active: false },
    { names: ['Cylinder002', 'Cylinder002_1'], targets: [], active: false },
    { names: ['Cylinder004', 'Cylinder004_1', 'Cylinder004_2', 'Cylinder004_3'], targets: [], active: false }
]
const hoverScale = 1.25
const hoverTweenDuration = 0.25

// Lamp toggle state (click to glow and emit light): Cylinder003_2
const lamp = {
    name: 'Cylinder003_2',
    target: null,
    on: false,
    colorOn: new THREE.Color(0xffee88),
    emissiveOn: 3.0,        // material emissiveIntensity when ON
    emissiveOff: 0.0,       // material emissiveIntensity when OFF
    tweenDuration: 0.25,
    light: null,
    lightIntensityOn: 3.0,  // point light intensity when ON
    lightIntensityOff: 0.0, // point light intensity when OFF
    lightDistance: 5.0,
    lightDecay: 2.0
}

// GUI: GLTF Animation params
const animParams = {
    clip: '-',
    timeScale: 1.0,
    loop: 'Repeat', // Repeat | Once | PingPong
    repetitions: -1, // -1 means infinite
    clampWhenFinished: false,
    crossFade: 0.3,
    play: () => playSelectedClip(),
    stop: () => stopCurrentClip()
}

// GUI: Test animation on children
const testParams = {
    target: 'All Children',
    type: 'Spin', // Spin | Bounce | Pulse | None
    duration: 1.5,
    repeat: -1, // -1 means infinite
    yoyo: false,
    ease: 'power1.inOut',
    speed: 1.0,
    apply: () => applyTestAnimation(),
    stop: () => stopTestAnimation()
}

// Internal maps for children and tweens
const childrenMap = new Map() // key: label, value: object3D
const testTweens = new WeakMap() // key: object3D, value: array of tweens

function buildChildrenMap(root) {
    childrenMap.clear()
    childrenMap.set('All Children', root)
    let idx = 0
    root.traverse((child) => {
        if (child.isMesh) {
            const label = `${idx.toString().padStart(3,'0')} | ${child.name || child.type}`
            childrenMap.set(label, child)
            selectableMeshes.push(child)
            idx++
            // capture initial transforms for restore
            if (!child.userData.initialTransform) {
                child.userData.initialTransform = {
                    position: child.position.clone(),
                    rotation: child.rotation.clone(),
                    scale: child.scale.clone()
                }
            }
        }
    })
}

function updateChildrenControllerOptions(controller) {
    controller.options([...childrenMap.keys()])
    controller.setValue('All Children')
}

function ensureMixer(root) {
    if (!mixer) mixer = new THREE.AnimationMixer(root)
}

function setLoopMode(action) {
    const mode = animParams.loop
    if (mode === 'Once') {
        action.setLoop(THREE.LoopOnce, 0)
        action.clampWhenFinished = animParams.clampWhenFinished
    } else if (mode === 'PingPong') {
        action.setLoop(THREE.LoopPingPong, animParams.repetitions < 0 ? Infinity : animParams.repetitions)
        action.clampWhenFinished = false
    } else {
        action.setLoop(THREE.LoopRepeat, animParams.repetitions < 0 ? Infinity : animParams.repetitions)
        action.clampWhenFinished = false
    }
}

function playSelectedClip() {
    if (!mixer || !gltfClips.length || animParams.clip === '-') return
    const clip = gltfClips.find(c => c.name === animParams.clip)
    if (!clip) return

    const nextAction = mixer.clipAction(clip)
    setLoopMode(nextAction)
    if (currentAction && currentAction !== nextAction) {
        currentAction.crossFadeTo(nextAction.reset().play(), animParams.crossFade, false)
    } else {
        nextAction.reset().play()
    }
    currentAction = nextAction
}

function stopCurrentClip() {
    if (currentAction) {
        currentAction.stop()
        currentAction = null
    }
}

function killTweensFor(object) {
    const arr = testTweens.get(object)
    if (arr) {
        arr.forEach(tw => tw.kill())
        testTweens.delete(object)
    }
}

function recordTween(object, tween) {
    const arr = testTweens.get(object) || []
    arr.push(tween)
    testTweens.set(object, arr)
    // apply current global speed
    tween.timeScale(testParams.speed)
}

function restoreInitialTransform(object) {
    const t = object.userData.initialTransform
    if (t) {
        object.position.copy(t.position)
        object.rotation.copy(t.rotation)
        object.scale.copy(t.scale)
    }
}

function applyTestAnimation() {
    if (!modelRoot) return
    const targets = []
    if (testParams.target === 'All Children') {
        modelRoot.traverse((child) => { if (child.isMesh) targets.push(child) })
    } else {
        const obj = childrenMap.get(testParams.target)
        if (obj && obj.isMesh) targets.push(obj)
    }

    // stop existing
    targets.forEach(o => { killTweensFor(o) })

    const type = testParams.type
    if (type === 'None') return

    targets.forEach(obj => {
        const t = obj.userData.initialTransform
        if (!t) {
            obj.userData.initialTransform = {
                position: obj.position.clone(),
                rotation: obj.rotation.clone(),
                scale: obj.scale.clone()
            }
        }
        if (type === 'Spin') {
            // continuous spin around Y
            const tw = gsap.to(obj.rotation, {
                y: obj.rotation.y + Math.PI * 2,
                duration: testParams.duration,
                ease: 'none',
                repeat: testParams.repeat < 0 ? -1 : testParams.repeat
            })
            recordTween(obj, tw)
        } else if (type === 'Bounce') {
            const startY = obj.userData.initialTransform.position.y
            const tw = gsap.to(obj.position, {
                y: startY + 0.2,
                duration: testParams.duration,
                ease: testParams.ease,
                yoyo: true,
                repeat: testParams.repeat < 0 ? -1 : testParams.repeat
            })
            recordTween(obj, tw)
        } else if (type === 'Pulse') {
            const base = obj.userData.initialTransform.scale
            const tw = gsap.to(obj.scale, {
                x: base.x * 1.2,
                y: base.y * 1.2,
                z: base.z * 1.2,
                duration: testParams.duration,
                ease: testParams.ease,
                yoyo: true,
                repeat: testParams.repeat < 0 ? -1 : testParams.repeat
            })
            recordTween(obj, tw)
        }
    })
}

function stopTestAnimation() {
    if (!modelRoot) return
    const toRestore = []
    if (testParams.target === 'All Children') {
        modelRoot.traverse((child) => { if (child.isMesh) toRestore.push(child) })
    } else {
        const obj = childrenMap.get(testParams.target)
        if (obj && obj.isMesh) toRestore.push(obj)
    }
    toRestore.forEach(o => {
        killTweensFor(o)
        restoreInitialTransform(o)
    })
}

function pointerToNDC(event) {
    const rect = canvas.getBoundingClientRect()
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
}

function isInGroup(obj, targets) {
    if (!obj || !targets || targets.length === 0) return false
    let n = obj
    while (n) {
        if (targets.includes(n)) return true
        n = n.parent
    }
    return false
}

function tweenScaleTo(object, factor) {
    if (!object || !object.userData.initialTransform) return
    gsap.killTweensOf(object.scale)
    const base = object.userData.initialTransform.scale
    gsap.to(object.scale, {
        x: base.x * factor,
        y: base.y * factor,
        z: base.z * factor,
        duration: hoverTweenDuration,
        ease: 'power2.out'
    })
}

function applyHoverGroup(group, active) {
    if (!group || !group.targets || group.targets.length === 0) return
    const factor = active ? hoverScale : 1.0
    group.targets.forEach(t => tweenScaleTo(t, factor))
}

// --- Lamp helpers ---
function collectMeshes(node) {
    const out = []
    if (!node) return out
    node.traverse((n) => { if (n.isMesh) out.push(n) })
    return out
}

function ensureMaterialUserData(mesh) {
    const mat = mesh.material
    if (!mat || typeof mat !== 'object') return
    if (!mat.userData) mat.userData = {}
    if (mat.userData._origEmissiveStored) return
    mat.userData._origEmissive = mat.emissive ? mat.emissive.clone() : new THREE.Color(0x000000)
    mat.userData._origEmissiveIntensity = typeof mat.emissiveIntensity === 'number' ? mat.emissiveIntensity : 0
    mat.userData._origEmissiveStored = true
}

function setLampGlow(on) {
    if (!lamp.target) return
    // Tween emissive on all meshes under the lamp target
    const meshes = collectMeshes(lamp.target)
    meshes.forEach((m) => {
        ensureMaterialUserData(m)
        const mat = m.material
        if (!mat) return
        if ('emissive' in mat && 'emissiveIntensity' in mat) {
            // Prepare color tween proxy
            const toColor = on ? lamp.colorOn : (mat.userData?._origEmissive || new THREE.Color(0x000000))
            const toIntensity = on ? lamp.emissiveOn : (mat.userData?._origEmissiveIntensity ?? 0)
            const colProxy = {
                r: mat.emissive?.r ?? 0,
                g: mat.emissive?.g ?? 0,
                b: mat.emissive?.b ?? 0,
                i: typeof mat.emissiveIntensity === 'number' ? mat.emissiveIntensity : 0
            }
            gsap.to(colProxy, {
                r: toColor.r,
                g: toColor.g,
                b: toColor.b,
                i: toIntensity,
                duration: lamp.tweenDuration,
                ease: 'power2.out',
                onUpdate: () => {
                    if (!mat.emissive) mat.emissive = new THREE.Color(0,0,0)
                    mat.emissive.setRGB(colProxy.r, colProxy.g, colProxy.b)
                    mat.emissiveIntensity = colProxy.i
                    mat.needsUpdate = true
                }
            })
        }
    })

    // Tween the attached point light intensity
    if (lamp.light) {
        gsap.to(lamp.light, {
            intensity: on ? lamp.lightIntensityOn : lamp.lightIntensityOff,
            duration: lamp.tweenDuration,
            ease: 'power2.out'
        })
    }
}

// --- Screen video control state ---
// let screenVideo = null
// const screenVideoParams = {
//     muted: true,
//     volume: 0.5,
//     rate: 1.0,
//     play: () => { if (screenVideo) screenVideo.play().catch(() => {}) },
//     pause: () => { if (screenVideo) screenVideo.pause() },
// }

// // Create a GUI folder for video controls
// const videoFolder = gui.addFolder('Screen Video')
// videoFolder.add(screenVideoParams, 'play').name('Play')
// videoFolder.add(screenVideoParams, 'pause').name('Pause')
// videoFolder.add(screenVideoParams, 'muted').name('Muted').onChange((v) => { if (screenVideo) screenVideo.muted = v })
// videoFolder.add(screenVideoParams, 'volume', 0, 1, 0.01).name('Volume').onChange((v) => {
//     if (screenVideo) {
//         screenVideo.volume = v
//         if (v > 0 && screenVideo.muted) {
//             screenVideo.muted = false
//             screenVideoParams.muted = false
//         }
//     }
// })
// videoFolder.add(screenVideoParams, 'rate', 0.25, 2.0, 0.05).name('Speed').onChange((v) => { if (screenVideo) screenVideo.playbackRate = v })

// --- Simple: apply video as material by mesh name (requires UVs) ---
function applyVideoToMeshByName(name, src, opts = {}) {
    if (!modelRoot) { console.warn('[video] model not ready'); return null }
    const target = modelRoot.getObjectByName(name)
    if (!target) { console.warn(`[video] object not found: ${name}`); return null }

    // If a group is passed, try to find a mesh inside
    const mesh = target.isMesh ? target : (() => { let m=null; target.traverse(n=>{ if(!m && n.isMesh) m=n }) ; return m })()
    if (!mesh) { console.warn(`[video] no mesh under object: ${name}`); return null }

    const hasUV = !!mesh.geometry.getAttribute('uv')
    if (!hasUV) { console.warn(`[video] mesh has no UVs: ${mesh.name}`); return null }

    const { autoplay = true, loop = true, muted = true, playsInline = true } = opts
    const video = document.createElement('video')
    video.src = src
    video.crossOrigin = 'anonymous'
    video.muted = muted
    video.loop = loop
    video.playsInline = playsInline
    video.autoplay = autoplay
    video.preload = 'auto'

    // Create texture
    const tex = new THREE.VideoTexture(video)
    tex.flipY = false // match glTF UV convention
    tex.colorSpace = THREE.SRGBColorSpace
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.needsUpdate = true

    // Replace material with an unlit one so video looks like a screen
    if (!mesh.userData._origMaterial) mesh.userData._origMaterial = mesh.material
    mesh.material = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
    mesh.material.needsUpdate = true

    // Start playback when ready (avoid black frame)
    const start = () => video.play().catch(()=>{})
    if (video.readyState >= 2) start(); else video.addEventListener('canplay', start, { once: true })

    // Update global screen video reference and sync GUI params
    // screenVideo = video
    // screenVideo.muted = opts.muted ?? screenVideoParams.muted
    // screenVideo.volume = screenVideoParams.volume
    // screenVideo.playbackRate = screenVideoParams.rate

    console.log(`[video] applied to ${mesh.name} from ${src}`)
    return { video, texture: tex, mesh }
}

/**
 * Loaders
 */
// Texture loader
const textureLoader = new THREE.TextureLoader()

// Draco loader
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('draco/')

// GLTF loader
const gltfLoader = new GLTFLoader()
gltfLoader.setDRACOLoader(dracoLoader)

// Page Loader overlay (minimum visible time)
const pageLoaderEl = document.getElementById('pageLoader')
const pageLoaderFillEl = pageLoaderEl ? pageLoaderEl.querySelector('.loader-bar .fill') : null
const navOverlayEl = document.getElementById('navOverlay')
const LOADER_MIN_MS = 2000
let loaderStartTs = performance.now()
function showNavOverlay() {
    if (!navOverlayEl) return
    navOverlayEl.style.display = 'grid'
    gsap.to(navOverlayEl, {
        opacity: 1,
        duration: 0.5,
        ease: 'power2.out'
    })
    const closeBtn = navOverlayEl.querySelector('[data-action="close-nav"]')
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            gsap.to(navOverlayEl, {
                opacity: 0,
                duration: 0.4,
                ease: 'power2.inOut',
                onComplete: () => { navOverlayEl.style.display = 'none' }
            })
        }, { once: true })
    }
}
function finishLoader() {
    if (!pageLoaderEl) return
    const elapsed = performance.now() - loaderStartTs
    const wait = Math.max(0, LOADER_MIN_MS - elapsed)
    window.setTimeout(() => {
        gsap.to(pageLoaderEl, {
            opacity: 0,
            duration: 0.5,
            ease: 'power2.out',
            onComplete: () => { pageLoaderEl.style.display = 'none'; showNavOverlay() }
        })
    }, wait)
}

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 2.05)
scene.add(ambientLight)

const directionalLight = new THREE.DirectionalLight(0xffffff, 4.3)
directionalLight.position.set(0.56, 4.73, 0.3)
scene.add(directionalLight)

// Additional: a window light (spot) to simulate sunlight/moonlight entering from window
const windowLight = new THREE.SpotLight(0xffffff, 0.0, 20, THREE.MathUtils.degToRad(32), 0.3, 1.5)
windowLight.position.set(2.5, 3.8, 3.2) // tweak as needed to match your window corner
windowLight.target.position.set(0, 1.2, 0)
scene.add(windowLight)
scene.add(windowLight.target)

// GUI controls
const dirFolder = gui.addFolder('Directional Light')
dirFolder.add(directionalLight, 'intensity', 0, 5, 0.01).name('intensity')
dirFolder.add(directionalLight.position, 'x', -20, 20, 0.01).name('pos x')
dirFolder.add(directionalLight.position, 'y', -20, 20, 0.01).name('pos y')
dirFolder.add(directionalLight.position, 'z', -20, 20, 0.01).name('pos z')
const dirParams = { color: '#ffffff' }
dirFolder.addColor(dirParams, 'color').name('color').onChange((v) => directionalLight.color.set(v))

const ambFolder = gui.addFolder('Ambient Light')
ambFolder.add(ambientLight, 'intensity', 0, 5, 0.01).name('intensity')
const ambParams = { color: '#ffffff' }
ambFolder.addColor(ambParams, 'color').name('color').onChange((v) => ambientLight.color.set(v))

// Lighting mode profiles and GUI toggle
const lightingMode = {
    isNight: false,
    day: {
        ambient: { intensity: 2.05, color: 0xffffff },
        dir: { intensity: 4.3, color: 0xffffff, pos: new THREE.Vector3(0.56, 4.73, 0.3) },
        window: { intensity: 0.0, color: 0xffffff },
        background: 0xf7fbff
    },
    night: {
        ambient: { intensity: 2.05, color: 0xbf00e6 },
        dir: { intensity: 4.3, color: 0xff00c8, pos: new THREE.Vector3(0.56, 4.73, 0.3) },
        window: { intensity: 0.9, color: 0xbf00e6 },
        background: 0x022b33
    }
}

function applyLightingMode(night) {
    const p = night ? lightingMode.night : lightingMode.day
    // Ambient
    gsap.to(ambientLight, { intensity: p.ambient.intensity, duration: 0.8, ease: 'power2.inOut' })
    {
        const target = new THREE.Color(p.ambient.color)
        gsap.to(ambientLight.color, {
            r: target.r, g: target.g, b: target.b,
            duration: 0.8, ease: 'power2.inOut'
        })
    }
    // Directional
    gsap.to(directionalLight, { intensity: p.dir.intensity, duration: 0.9, ease: 'power2.inOut' })
    {
        const target = new THREE.Color(p.dir.color)
        gsap.to(directionalLight.color, {
            r: target.r, g: target.g, b: target.b,
            duration: 0.9, ease: 'power2.inOut'
        })
    }
    gsap.to(directionalLight.position, { x: p.dir.pos.x, y: p.dir.pos.y, z: p.dir.pos.z, duration: 1.0, ease: 'power2.inOut' })
    // Window spotlight
    gsap.to(windowLight, { intensity: p.window.intensity, duration: 0.8, ease: 'power2.inOut' })
    {
        const target = new THREE.Color(p.window.color)
        gsap.to(windowLight.color, {
            r: target.r, g: target.g, b: target.b,
            duration: 0.8, ease: 'power2.inOut'
        })
    }
    // Scene background
    {
        if (!scene.background) scene.background = new THREE.Color(0x000000)
        const target = new THREE.Color(p.background)
        gsap.to(scene.background, {
            r: target.r, g: target.g, b: target.b,
            duration: 1.2, ease: 'power2.inOut'
        })
    }

    // Lamp auto-toggle with mode
    if (typeof setLampGlow === 'function' && lamp && lamp.target) {
        lamp.on = !!night
        const delay = night ? 0.25 : 0.0 // slight delay when turning ON at night
        gsap.delayedCall(delay, () => setLampGlow(lamp.on))
    }
}

const lightingFolder = gui.addFolder('Switch Modes')
lightingFolder.add({ toggle: () => { lightingMode.isNight = !lightingMode.isNight; applyLightingMode(lightingMode.isNight) } }, 'toggle').name('Toggle Day/Night')
// lightingFolder.add(lightingMode, 'isNight').name('Night Mode').onChange((v) => applyLightingMode(v))

// Remove window spotlight controls from GUI
// const windowFolder = lightingFolder.addFolder('Window Light (Spot)')
// windowFolder.add(windowLight.position, 'x', -10, 10, 0.01).name('pos x')
// windowFolder.add(windowLight.position, 'y', -10, 10, 0.01).name('pos y')
// windowFolder.add(windowLight.position, 'z', -10, 10, 0.01).name('pos z')
// windowFolder.add(windowLight, 'angle', 0.05, 1.2, 0.01).name('angle')
// windowFolder.add(windowLight, 'penumbra', 0.0, 1.0, 0.01).name('penumbra')
// windowFolder.add(windowLight, 'decay', 0.1, 3.0, 0.1).name('decay')
// windowFolder.add(windowLight, 'distance', 0.0, 40.0, 0.1).name('distance')
// const winParams = { color: '#ffffff' }
// windowFolder.addColor(winParams, 'color').name('color').onChange(v => windowLight.color.set(v))

// Initialize lighting to current mode
applyLightingMode(lightingMode.isNight)

// GLB Model
// Vite serves files in `static/` at the root. With `publicDir: '../static/'`,
// the model is available as 'Word.glb'.
gltfLoader.load(
    'v10.glb',
    (gltf) =>
    {
        const model = gltf.scene
        modelRoot = model
        // Collect selectable meshes and build children map
        buildChildrenMap(model)

        // Setup animations if present
        if (gltf.animations && gltf.animations.length) {
            gltfClips = gltf.animations
            ensureMixer(model)
            // update GUI clip dropdown
            if (animClipController) {
                animClipController.options(['-', ...gltfClips.map(c => c.name)])
                animClipController.setValue(gltfClips[0].name)
                animParams.clip = gltfClips[0].name
            }
        }
        // update children target dropdown
        if (testTargetController) {
            updateChildrenControllerOptions(testTargetController)
        }

        // Resolve hover group targets by name
        hoverGroups.forEach(g => {
            g.targets = g.names.map(n => model.getObjectByName(n)).filter(Boolean)
        })

        // Resolve lamp target and attach a point light so it emits light when toggled
        lamp.target = model.getObjectByName(lamp.name) || null
        if (lamp.target && !lamp.light) {
            lamp.light = new THREE.PointLight(lamp.colorOn, lamp.lightIntensityOff, lamp.lightDistance, lamp.lightDecay)
            lamp.light.castShadow = false
            lamp.light.position.set(0, 0, 0) // adjust if bulb is offset
            lamp.target.add(lamp.light)
        }

        // Adjust transform if needed
        // model.scale.set(1, 1, 1)
        // model.position.set(0, 0, 0)
        scene.add(model)
        // Hide loader after model is added (respect min visible time)
        finishLoader()

        // Apply video directly to mesh by name (requires UVs)
        const res = applyVideoToMeshByName('Cube007_1', 'video.mp4', {
            autoplay: true,
            loop: true,
            muted: true,
            playsInline: true
        })
        if (!res) {
            console.warn('[video] direct map failed (missing object or UVs).')
        }
    },
    (xhr) => {
        // Update loader bar width using actual progress
        if (pageLoaderEl && pageLoaderFillEl) {
            // Disable CSS animation and drive width manually
            pageLoaderFillEl.style.animation = 'none'
            const total = xhr.total || 0
            if (total > 0) {
                const p = xhr.loaded / total
                pageLoaderFillEl.style.width = `${Math.min(100, Math.max(0, Math.round(p * 100)))}%`
            }
        }
    },
    (error) =>
    {
        console.error('Error loading GLB:', error)
        // Still hide loader so the app remains usable
        finishLoader()
    }
)

/**
 * Sizes
 */
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight
}

window.addEventListener('resize', () =>
{
    // Update sizes
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight

    // Update camera
    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()

    // Update renderer
    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

/**
 * Camera
 */
// Base camera
const camera = new THREE.PerspectiveCamera(22, sizes.width / sizes.height, 0.1, 100)
// Default view: slightly zoomed in and angled from front-right, leaving room on the right for GUI
camera.position.set(7, 10, 9.0)
scene.add(camera)

// Remember initial view and target
const initialCamPos = camera.position.clone()
// Aim a bit to the right so the scene sits more on the left side of the viewport
const initialTarget = new THREE.Vector3(0.7, 1.9, -1)

/**
 * Controls
 */
const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.target.copy(initialTarget)
controls.update()
// Disable native wheel zoom; we will implement our own buttery-smooth zoom
controls.enableZoom = false

/**
 * Camera focus animation + GUI (defaults to match reference)
 */
const focusParams = { duration: 0.5, fitOffset: 1.0 }
const focusFilter = { lockNames: '' }
let lockSet = new Set()
let camTween = null
let targetTween = null
// Smooth zoom state
let zoomTween = null

// Smooth zoom parameters
const zoomParams = {
    enabled: true,
    duration: 0.7,   // slightly longer for extra buttery smoothness
    speed: 0.0025,   // lightly lower sensitivity
    minDistance: 2.0, // clamp min distance to target
    maxDistance: 40.0 // clamp max distance to target
}

function updateLockSet() {
    lockSet = new Set(
        focusFilter.lockNames
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
    )
}

function isLocked(object) {
    // Check object and its ancestors by name
    let n = object
    while (n) {
        if (lockSet.has(n.name)) return true
        n = n.parent
    }
    return false
}

function focusOnObject(object) {
    if (!object || isLocked(object)) return

    const box = new THREE.Box3().setFromObject(object)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1

    const halfFov = THREE.MathUtils.degToRad(camera.fov * 0.5)
    const distance = (radius * focusParams.fitOffset) / Math.tan(halfFov)

    const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize()
    const newPos = center.clone().add(dir.multiplyScalar(distance))

    if (camTween) camTween.kill()
    if (targetTween) targetTween.kill()

    camTween = gsap.to(camera.position, {
        duration: focusParams.duration,
        x: newPos.x,
        y: newPos.y,
        z: newPos.z,
        ease: 'power2.out'
    })

    const targetProxy = controls.target.clone()
    targetTween = gsap.to(targetProxy, {
        duration: focusParams.duration,
        x: center.x,
        y: center.y,
        z: center.z,
        ease: 'power2.out',
        onUpdate: () => controls.target.copy(targetProxy)
    })
}

function smoothZoom(deltaY) {
    if (!zoomParams.enabled) return

    // Kill other tweens to avoid fighting animations
    if (camTween) camTween.kill()
    if (targetTween) targetTween.kill()
    if (zoomTween) zoomTween.kill()

    const dir = new THREE.Vector3().subVectors(camera.position, controls.target)
    let distance = dir.length()

    // Exponential scale feels consistent across devices (mouse vs trackpad)
    const scale = Math.exp(deltaY * zoomParams.speed)
    const targetDist = THREE.MathUtils.clamp(distance * scale, zoomParams.minDistance, zoomParams.maxDistance)

    dir.normalize()
    const targetPos = controls.target.clone().add(dir.multiplyScalar(targetDist))

    const distanceProxy = { value: distance }
    zoomTween = gsap.to(distanceProxy, {
        duration: zoomParams.duration,
        value: targetDist,
        ease: 'expo.out',
        onUpdate: () => {
            const dirNow = new THREE.Vector3().subVectors(camera.position, controls.target).normalize()
            const newPos = controls.target.clone().add(dirNow.multiplyScalar(distanceProxy.value))
            camera.position.copy(newPos)
        },
        onComplete: () => {
            // keep desiredDistance as-is so subsequent small wheels continue smoothly
        }
    })
}

function isLinkObject(obj) {
    // Detect if the intersected object or any ancestor matches our link targets
    const linkNames = new Set([
        'Cylinder005', 'Cylinder005_1',
        'Cylinder002', 'Cylinder002_1',
        'Plane001_1', 'Plane001_2',
        'Cylinder004', 'Cylinder004_1', 'Cylinder004_2', 'Cylinder004_3'
    ])
    let n = obj
    while (n) {
        if (linkNames.has(n.name)) return true
        n = n.parent
    }
    return false
}

canvas.addEventListener('pointermove', (event) => {
    if (!selectableMeshes.length) return
    const rect = canvas.getBoundingClientRect()
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
    raycaster.setFromCamera(mouse, camera)

    let hoveredForInfo = null
    const hitsAll = raycaster.intersectObjects(selectableMeshes, true)
    if (hitsAll.length) hoveredForInfo = hitsAll[0].object
    updateHoverTooltip(event, hoveredForInfo)

    // Show hand cursor when hovering linkable objects
    const hoveringLink = hitsAll.some(h => isLinkObject(h.object))
    canvas.style.cursor = hoveringLink ? 'pointer' : 'default'

    // Hover-group detection and scaling
    hoverGroups.forEach(g => {
        const hovering = hitsAll.some(h => isInGroup(h.object, g.targets))
        if (hovering !== g.active) {
            g.active = hovering
            applyHoverGroup(g, hovering)
        }
    })
})

function onPointerDown(event) {
    if (event.button !== 0) return
    pointerToNDC(event)
    raycaster.setFromCamera(mouse, camera)
    const hits = raycaster.intersectObjects(selectableMeshes, true)

    // Open link depending on which object was clicked
    if (hits.length) {
        // Find first named ancestor among our link targets
        let url = null
        for (const h of hits) {
            let n = h.object
            while (n) {
                if (n.name === 'Cylinder005' || n.name === 'Cylinder005_1') {
                    // Telegram
                    url = 'https://t.me/nomadicaddict'
                    break
                }
                if (n.name === 'Cylinder002' || n.name === 'Cylinder002_1') {
                    // WhatsApp with +91
                    url = 'https://wa.me/918668824809'
                    break
                }
                if (n.name === 'Plane001_1' || n.name === 'Plane001_2') {
                    // Instagram
                    url = 'https://www.instagram.com/deathnoteuser5'
                    break
                }
                if (
                    n.name === 'Cylinder004' || n.name === 'Cylinder004_1' ||
                    n.name === 'Cylinder004_2' || n.name === 'Cylinder004_3'
                ) {
                    // TikTok
                    url = 'https://www.tiktok.com/@smartenspaces?_t=ZP-8zVlEv7Dvkl&_r=1'
                    break
                }
                n = n.parent
            }
            if (url) break
        }
        if (url) {
            window.open(url, '_blank', 'noopener,noreferrer')
            return
        }
    }

    // Lamp click toggle: if clicked on lamp or its descendants, toggle and stop
    if (lamp.target && hits.some(h => {
        let n = h.object
        while (n) { if (n === lamp.target) return true; n = n.parent }
        return false
    })) {
        lamp.on = !lamp.on
        setLampGlow(lamp.on)
        return
    }

    // Otherwise, you can handle other single-click behaviors here or leave it empty
}

function onDoubleClick(event) {
    pointerToNDC(event)
    raycaster.setFromCamera(mouse, camera)
    const hits = raycaster.intersectObjects(selectableMeshes, true)
    if (hits.length) {
        focusOnObject(hits[0].object)
    }
}

function onWheel(e) {
    // Prevent the page from scrolling and stop OrbitControls internal handling
    e.preventDefault()
    // Normalize delta across browsers/devices: pixels (0), lines (1), pages (2)
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : (e.deltaMode === 2 ? e.deltaY * sizes.height : e.deltaY)
    smoothZoom(delta)
}

// Enable left-click handling for lamp toggle (double-click still focuses)
canvas.addEventListener('pointerdown', onPointerDown)
canvas.addEventListener('dblclick', onDoubleClick)
// Smooth zoom wheel listener (passive: false to allow preventDefault)
canvas.addEventListener('wheel', onWheel, { passive: false })

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true
})
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

// GUI: Camera Focus and Focus Filter
// const focusFolder = gui.addFolder('Camera Focus')
// focusFolder.add(focusParams, 'duration', 0.1, 5, 0.05).name('anim duration')
// focusFolder.add(focusParams, 'fitOffset', 1.0, 3.0, 0.05).name('fit offset')
// focusFolder.add({ reset: () => {
//     if (camTween) camTween.kill()
//     if (targetTween) targetTween.kill()
//     if (zoomTween) zoomTween.kill()
//     gsap.to(camera.position, { duration: 0.8, x: initialCamPos.x, y: initialCamPos.y, z: initialCamPos.z, ease: 'power2.out' })
//     const targetProxy = controls.target.clone()
//     gsap.to(targetProxy, { duration: 0.8, x: initialTarget.x, y: initialTarget.y, z: initialTarget.z, ease: 'power2.out', onUpdate: () => controls.target.copy(targetProxy) })
// }}, 'reset').name('Reset View')

// Remove Focus Filter GUI (keep functionality defaulted)
// const filterFolder = gui.addFolder('Focus Filter')
// filterFolder.add(focusFilter, 'lockNames').name('lock names (comma)').onFinishChange(() => updateLockSet())
// initialize lock set
updateLockSet()

// Smooth Zoom GUI
// const zoomFolder = gui.addFolder('Smooth Zoom')
// zoomFolder.add(zoomParams, 'enabled').name('enabled')
// zoomFolder.add(zoomParams, 'duration', 0.05, 2.0, 0.01).name('anim duration')
// zoomFolder.add(zoomParams, 'speed', 0.0002, 0.003, 0.0001).name('wheel speed')
// zoomFolder.add(zoomParams, 'minDistance', 0.5, 20.0, 0.1).name('min distance').onChange(v => {
//     zoomParams.minDistance = Math.min(v, zoomParams.maxDistance - 0.1)
// })
// zoomFolder.add(zoomParams, 'maxDistance', 5.0, 200.0, 0.1).name('max distance').onChange(v => {
//     zoomParams.maxDistance = Math.max(v, zoomParams.minDistance + 0.1)
// })

// GLTF Animations GUI
// const animFolder = gui.addFolder('GLTF Animations')
let animClipController = null
// animFolder.add(animParams, 'clip', ['-']).name('clip')
// animFolder.add(animParams, 'play').name('Play')
// animFolder.add(animParams, 'stop').name('Stop')
// animFolder.add(animParams, 'timeScale', 0.1, 3.0, 0.01).name('speed')
// animFolder.add(animParams, 'crossFade', 0.0, 1.5, 0.01).name('crossfade')
// animFolder.add(animParams, 'loop', ['Repeat', 'Once', 'PingPong']).name('loop mode')
// animFolder.add(animParams, 'repetitions', -1, 20, 1).name('repetitions')
// animFolder.add(animParams, 'clampWhenFinished').name('clamp when finished')

// Remove Test Animations GUI
// const testFolder = gui.addFolder('Test Animations')
let testTargetController = null
// testFolder.add(testParams, 'target', ['All Children']).name('target')
// testFolder.add(testParams, 'type', ['Spin', 'Bounce', 'Pulse', 'None']).name('type')
// testFolder.add(testParams, 'duration', 0.1, 5.0, 0.05).name('duration (s)')
// testFolder.add(testParams, 'repeat', -1, 20, 1).name('repeat')
// testFolder.add(testParams, 'yoyo').name('yoyo')
// testFolder.add(testParams, 'ease', ['power1.inOut', 'power2.inOut', 'power3.inOut', 'sine.inOut', 'expo.inOut', 'back.inOut']).name('ease')
// testFolder.add(testParams, 'speed', 0.1, 3.0, 0.01).name('speed').onChange((v) => {
//     // update all active tweens
//     childrenMap.forEach((obj, key) => {
//         if (obj && obj.isObject3D) {
//             const arr = testTweens.get(obj)
//             if (arr) arr.forEach(tw => tw.timeScale(v))
//         }
//     })
// })
// testFolder.add(testParams, 'apply').name('Apply')
// testFolder.add(testParams, 'stop').name('Stop')

/**
 * Animate
 */
const clock = new THREE.Clock()

const tick = () =>
{
    const elapsedTime = clock.getElapsedTime()
    const delta = clock.getDelta()

    // Update controls
    controls.update()

    // Update mixer
    if (mixer) {
        mixer.timeScale = animParams.timeScale
        mixer.update(delta)
    }

    // Render
    renderer.render(scene, camera)

    // Call tick again on the next frame
    window.requestAnimationFrame(tick)
}

tick()