export const createScene = async function () {
    // === Babylon.js XR + GLB Loader + Animation Panel ===

    const canvas = document.getElementById("renderCanvas");
    const engine = new BABYLON.Engine(canvas, true);
    const scene = new BABYLON.Scene(engine);

    // Lighting
    const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 10, height: 10 }, scene);

    // Camera
    scene.createDefaultCamera(true, false, true);
    var camera = new BABYLON.ArcRotateCamera("camera", 0, 1, 10, BABYLON.Vector3.Zero(), scene);
    camera.attachControl(canvas, true);

    // Enable WebXR
    const xrHelperPromise = scene.createDefaultXRExperienceAsync({
        uiOptions: { sessionMode: "immersive-ar" },
        optionalFeatures: true
    });

    // === GUI 3D Manager ===
    const manager = new BABYLON.GUI.GUI3DManager(scene);
    const panel3D = new BABYLON.GUI.StackPanel3D();
    panel3D.margin = 0.03;
    manager.addControl(panel3D);
    panel3D.position = new BABYLON.Vector3(0, 1.5, 1.5);

    function create3DButton(text, onClick) {
        const button = new BABYLON.GUI.HolographicButton("btn_" + text);
        button.text = text;
        // if (button.mesh)
            
        button.onPointerUpObservable.add(onClick);
        panel3D.addControl(button);
        // button.mesh.rotation.y = 3.14;
        return button;
    }

    // === File input for GLB ===
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".glb,.gltf";
    input.style.display = "none";
    document.body.appendChild(input);

    // Load button (3D XR compatible)
    create3DButton("📂 Load GLB/GLTF", () => input.click());

    // Track animation groups
    let animGroups = [];
    let currentModelRoot = null;

    // Handle model load
    input.addEventListener("change", async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // Clear previous
        scene.meshes.filter(m => m.name !== "ground").forEach(m => m.dispose());
        scene.animationGroups.slice().forEach(ag => ag.dispose());
        animGroups = [];
        try {
            const result = await BABYLON.SceneLoader.AppendAsync("file:", file, scene)
            // const result = await BABYLON.SceneLoader.AppendAsync("file:", file, scene).then((result) => {
            //     const newMeshes = result.meshes[1];
            //     newMeshes.scaling.setAll(0.2);
            // });
            currentModelRoot = result.meshes[1];
            currentModelRoot.scaling.setAll(0.2);
            // scene.createDefaultCameraOrLight(true, true, true);
            animGroups = scene.animationGroups;

            // Remove old buttons except first (Load)
            while (panel3D.children.length > 1) panel3D.removeControl(panel3D.children[1]);

            if (animGroups.length === 0) {
                create3DButton("No animations found", () => {});
                return;
            }

            // "Play All (Parallel)"
            create3DButton("▶ Play All", () => {
                animGroups.forEach(a => {
                    a.reset();
                    a.start(true, 1.0, a.from, a.to, false); // try to run all together
                });
            });

            // Individual actions
            animGroups.forEach(a => {
                create3DButton(a.name || "Action", () => {
                    animGroups.forEach(g => g.stop());
                    a.reset();
                    a.start(true);
                });
            });

        } catch (err) {
            console.error("Error loading model:", err);
        }
    });

    const xr = await scene.createDefaultXRExperienceAsync({
        uiOptions: {sessionMode: 'immersive-ar'},
        optionalFeatures: true,
        disableTeleportation: true,
    });

    xr.baseExperience.onInitialXRPoseSetObservable.add((xrCamera) => {
        // Set the user's initial height to 2 units, relative to the reference space.
        xrCamera.position.z = -2;
    });

    // New Code
    xr.baseExperience.camera.inputs.clear();

    var rightController = null;
    xr.input.onControllerAddedObservable.add(ctrl => {
        if (ctrl.inputSource && ctrl.inputSource.handedness === "right") {
            rightController = ctrl;
        }
    });
    xr.input.onControllerRemovedObservable.add(ctrl => {
        if (rightController && ctrl.uniqueId === rightController.uniqueId) {
            rightController = null;
        }
    });

    var speed = 0.03;
    var deadZone = 0.02;
    scene.onBeforeRenderObservable.add(() => {
        if (!rightController || !rightController.inputSource) return;
        var gamePad = rightController.inputSource.gamepad;
        if (!gamePad) return;

        // Move anim model in plane
        if (currentModelRoot) {
            var axisX = gamePad.axes[2] ?? gamePad.axes[0] ?? 0;
            var axisY = gamePad.axes[3] ?? gamePad.axes[1] ?? 0;
            if (Math.abs(axisX) > deadZone || Math.abs(axisY) > deadZone) {
                var lookVec = scene.activeCamera.getForwardRay().direction.clone();
                lookVec.y = 0; lookVec.normalize();
                var move = lookVec.scale(axisX * speed).add(lookVec.scale(axisY * speed));
                currentModelRoot.position.addInPlace(move);
            }
        }
    });

    engine.runRenderLoop(() => scene.render());
    window.addEventListener("resize", () => engine.resize());

    return scene;
};