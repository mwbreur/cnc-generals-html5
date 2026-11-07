
        let scene, camera, renderer, groundPlane;
        let units = [], structures = [];
        let selectedStructure = null;
        const healthBarElements = new Map();
        let playerResources = 1200;
        let selectedFaction = 'usa';
        let choosingBaseLocation = false;
        
        let supplyCenterPos = new THREE.Vector3(-30, 0, -20);
        const supplyPoints = [];
        let activeCustomMap = null;
        let savedCustomMaps = {};

        let currentWaterLevel = -1.2;
        const mapBridges = []; // Array of bridge bounding areas: { position, width, length, rotationY, deckY }
        let randomMapSeed = 42;
        let randomMapRiverFreq = 0.015;
        let selectedSupplyPoint = null;
        let activeBlueprintType = null;
        let blueprintMesh = null;
        let isBlueprintValid = true;
        let aiDecisionTimer = 0;
        const AI_TICK_RATE = 60; // AI reassesses tactical targets every 60 frames (~1 second) to maintain high performance
        let buildingTick = 0;
        let battlePlan = 'balanced';
        let pendingSuperweapon = null;
        let intelTimer = 0;
        const landmines = [];


        let cameraTarget = new THREE.Vector3(0, 0, 0);
        let cameraRadius = 135;
        let cameraAlpha = -Math.PI / 4; 
        let cameraBeta = Math.PI / 3;  
        const panSpeed = 0.7;
        const zoomSpeed = 2.5;
        const keysPressed = {};
        let isRotatingCamera = false;
        let previousMousePosition = { x: 0, y: 0 };
		let enemyUnits = []; // Holds hostile AI entities

        let isDragging = false;
        let startPoint = { x: 0, y: 0 };
        const selectionBox = document.getElementById('selection-box');
        const selectionStatus = {
            set textContent(val) { showNotification(val); },
            set innerHTML(val) { showNotification(val); },
            get textContent() { return document.getElementById('tactical-message')?.textContent || ''; }
        };
        const progressContainer = document.getElementById('build-progress');
        const progressFill = document.getElementById('build-progress-fill');
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        