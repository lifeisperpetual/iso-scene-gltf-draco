import { rendererReference } from "three/tsl";

let currentIntersects = [];
const raycasterobjects = []
let currentHoveredObject = null;
let currentHoveredV2Object = null;

const sociallinks = {
    linkedin: "https://www.linkedin.com/in/druv-nagpal/",
    github: "https://github.com/Druv-4182122",
    Threejs: "https://threejs-journey.com/certificate/view/15155",
    Luffy: "https://drive.google.com/file/d/1PIZh0LnVV4e7hdPr55YhotOcyEIZcGMg/view"
}

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()

window.addEventListener('mousemove', (event) =>
{
    pointer.x = (event.clientX / sizes.width) * 2 - 1
    pointer.y = - (event.clientY / sizes.height) * 2 + 1
})


window.addEventListener('click', () => {
    if (currentIntersects.length > 0) {
        const object = currentIntersects[0].object;

        // First, always check if a social link was clicked, regardless of zoom state.
        let isSocialLink = false;
        for (const [key, url] of Object.entries(sociallinks)) {
            if (object.name.toLowerCase().includes(key.toLowerCase())) {
                window.open(url, "_blank");
                isSocialLink = true;
                break;
            }
        }
        
        // If a link was clicked, stop here.
        if (isSocialLink) {
            return;
        }
    }
});



inside gltf load 

if (child.name.includes("raycaster")) {
    raycasterobjects.push(child)
}

beneath renderer

function playHoverAnimation(object, isHovering) {
    gsap.killTweensOf([object.scale, object.rotation, object.position])
    if (isHovering) {
        gsap.to(object.scale, {
            y: object.userData.initialScale.y * 1.5,
            z: object.userData.initialScale.z * 1.5,
            x: object.userData.initialScale.x * 1.5,
            duration: 0.5,
            ease: "bounce.out(5)"
        })
    }
    else {
        gsap.to(object.scale, {
            x: object.userData.initialScale.x,
            y: object.userData.initialScale.y,
            z: object.userData.initialScale.z,
            duration: 0.3,
            ease: "bounce.out(1.8)"
        })
        gsap.to(object.rotation, {
            x: object.userData.initialRotation.x,
            duration: 0.3,
            ease: "bounce.out(1.8)"
        })
    }
}


in tick function

raycaster.setFromCamera(pointer, camera)
    currentIntersects = raycaster.intersectObjects(raycasterobjects);

    if (currentIntersects.length > 0) {
        const currentIntersectObject = currentIntersects[0].object

        if (["headset", "plushie_1", "plushie_2"].some(name => currentIntersectObject.name.includes(name))) {
            if (currentIntersectObject !== currentHoveredObject) {
                if (currentHoveredObject) {
                    playHoverAnimation(currentHoveredObject, false)
                }
                playHoverAnimation(currentIntersectObject, true)
                currentHoveredObject = currentIntersectObject
            }
        }

        if (currentIntersectObject.name.includes("hoverV2")) {
            if (currentIntersectObject !== currentHoveredV2Object) {
                if (currentHoveredV2Object) {
                    animatelinks(currentHoveredV2Object, false)
                }
                animatelinks(currentIntersectObject, true)
                currentHoveredV2Object = currentIntersectObject
            }
        }

        if (currentIntersectObject.name.includes("pointer")) {
            document.body.style.cursor = 'pointer'
        } else {
            document.body.style.cursor = 'default'
        }
    }
    else {
        if (currentHoveredObject) {
            playHoverAnimation(currentHoveredObject, false)
            currentHoveredObject = null
        }
        if (currentHoveredV2Object) {
            animatelinks(currentHoveredV2Object, false)
            currentHoveredV2Object = null
        }
        document.body.style.cursor = 'default'
    }