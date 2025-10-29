// Космическая музыка
function initSpaceMusic() {
  const music = document.createElement('audio');
  music.id = 'spaceMusic';
  music.loop = true;
  music.volume = 0.4;
  music.preload = 'auto';
  
  const musicFiles = [
    'https://github.com/Dmitrynest2012/SpaceSurvival/blob/main/music/1.mp3'
  ];
  
  music.src = musicFiles[0];
  document.body.appendChild(music);
  
  let musicStarted = false;
  function startMusic() {
    if (musicStarted) return;
    music.play().then(() => {
      musicStarted = true;
      console.log('Космическая музыка запущена!');
    }).catch(() => {
      console.log('Музыка будет запущена при первом клике');
    });
  }
  
  document.addEventListener('click', startMusic, { once: true });
  
  function pauseOnMenu(open) {
    if (musicStarted) {
      music.volume = open ? 0.15 : 0.4;
    }
  }
  
  window.pauseMusicOnMenu = pauseOnMenu;
  return music;
}

window.addEventListener('load', () => {
  const music = initSpaceMusic();
  window.spaceMusic = music;
});

let spaceMusic = null;

/* ---------- Инициализация three.js сцены ---------- */
let scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.000001);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000000);
camera.position.set(0, 200, 800);

/* ---- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---- */
let isLocked = false;
let inventoryOpen = false;
let craftOpen = false;
let selectedQuickSlot = 1;
let crafting = false;
let craftProgress = 0;
let placingPlatform = false;
let platformGhost = null;
const PI_2 = Math.PI / 2;
let yaw = 0, pitch = 0;
let gameRunning = true;

let inGravityZone = false;
let gravityBody = null;
let gravityScreenRed = 0;
let boostActive = false;

const placedPlatforms = new THREE.Group();
scene.add(placedPlatforms);

/* ---- FPS КАМЕРА ---- */
function onMouseMove(e) {
  if (!isLocked || !gameRunning || inventoryOpen || craftOpen || placingPlatform) return;
  const movementX = e.movementX || e.mozMovementX || e.webkitMovementX || 0;
  const movementY = e.movementY || e.mozMovementY || e.webkitMovementY || 0;
  
  yaw -= movementX * 0.002;
  pitch -= movementY * 0.002;
  pitch = Math.max(-PI_2 + 0.1, Math.min(PI_2 - 0.1, pitch));
  
  camera.rotation.order = 'YXZ';
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
}
document.addEventListener('mousemove', onMouseMove, false);

/* pointer lock */
const overlay = document.getElementById('overlay');
overlay.addEventListener('click', () => {
  if (!inventoryOpen && !craftOpen && !placingPlatform && gameRunning) {
    renderer.domElement.requestPointerLock();
  }
});
document.addEventListener('pointerlockchange', lockChange, false);
document.addEventListener('mozpointerlockchange', lockChange, false);
function lockChange() {
  isLocked = (document.pointerLockElement === renderer.domElement || document.mozPointerLockElement === renderer.domElement);
  overlay.style.display = (isLocked && gameRunning) ? 'none' : 'flex';
}

/* Освещение */
scene.add(new THREE.AmbientLight(0x222222, 0.2));

const starLight = new THREE.DirectionalLight(0xfff3b0, 50.0);
starLight.position.set(450000, 200000, -100000);
starLight.target.position.set(0, 0, 0);
scene.add(starLight.target);
scene.add(starLight);

const starLight2 = new THREE.PointLight(0xffe680, 30.0, 600000);
starLight2.position.set(450000, 200000, -100000);
scene.add(starLight2);

const starLight3 = new THREE.PointLight(0xffffaa, 20.0, 500000);
starLight3.position.set(450000, 200000, -100000);
scene.add(starLight3);

const planetLight = new THREE.DirectionalLight(0x2aa0ff, 2.0);
planetLight.position.set(0, -60000, -100000);
planetLight.target.position.set(0, 0, 0);
scene.add(planetLight.target);
scene.add(planetLight);

/* Планета */
const planetGeo = new THREE.SphereGeometry(24000, 64, 32);
const planetMat = new THREE.MeshPhongMaterial({ 
  color: 0x2aa0ff, 
  shininess: 100, 
  specular: 0x222222,
  emissive: 0x112244 
});
const planet = new THREE.Mesh(planetGeo, planetMat);
planet.position.set(0, -150000, -80000);
scene.add(planet);

const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(25000, 64, 32), 
  new THREE.MeshBasicMaterial({color: 0x4ac0ff, transparent: true, opacity: 0.2, side: THREE.BackSide})
);
planet.add(atmosphere);

/* Звезда */
const star = new THREE.Mesh(
  new THREE.SphereGeometry(12000, 32, 16), 
  new THREE.MeshBasicMaterial({color: 0xffffff})
);
star.position.set(450000, 200000, -100000);
scene.add(star);

const starGlows = [];
const glowRadii = [18000, 24000, 32000, 40000, 50000, 65000, 80000];
const glowOpacities = [1.0, 0.9, 0.75, 0.6, 0.45, 0.3, 0.15];
const glowColors = [0xffffff, 0xfff3b0, 0xffd700, 0xffe6b3, 0xfff0cc, 0xfff8dd, 0xfffaf0];

for (let i = 0; i < 7; i++) {
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(glowRadii[i], 32, 16),
    new THREE.MeshBasicMaterial({
      color: glowColors[i],
      transparent: true,
      opacity: glowOpacities[i],
      side: THREE.BackSide
    })
  );
  star.add(glow);
  starGlows.push(glow);
}

/* Космическая пыль */
const dustParticles = new THREE.Group();
scene.add(dustParticles);

function generateDustCloud(center, radius) {
  const count = 300 + Math.random() * 200;
  const g = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * radius;
    const height = (Math.random() - 0.5) * radius * 0.3;
    
    positions[i * 3] = center.x + Math.cos(angle) * dist;
    positions[i * 3 + 1] = center.y + height;
    positions[i * 3 + 2] = center.z + Math.sin(angle) * dist;
    
    sizes[i] = 0.5 + Math.random() * 2;
  }
  
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  
  const material = new THREE.PointsMaterial({
    size: 1,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.3 + Math.random() * 0.2,
    color: new THREE.Color().setHSL(0.6 + Math.random() * 0.3, 0.3 + Math.random() * 0.4, 0.5 + Math.random() * 0.3)
  });
  
  return new THREE.Points(g, material);
}

for (let i = 0; i < 20; i++) {
  const center = new THREE.Vector3(
    (Math.random() - 0.5) * 200000,
    200 + Math.random() * 400,
    (Math.random() - 0.5) * 200000
  );
  dustParticles.add(generateDustCloud(center, 8000 + Math.random() * 12000));
}

function addDustCloudsAroundPlayer() {
  const playerPos = camera.position;
  for (let i = 0; i < 3; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 20000 + Math.random() * 30000;
    const center = playerPos.clone().add(new THREE.Vector3(
      Math.cos(angle) * dist,
      0,
      Math.sin(angle) * dist
    ));
    dustParticles.add(generateDustCloud(center, 6000 + Math.random() * 10000));
  }
}

/* Предметы */
const pickups = new THREE.Group();
scene.add(pickups);

// Загрузка GLB моделей
const loader = new THREE.GLTFLoader();
let waterModel = null;
let screwModel = null;
let oxygenModel = null;
let foodModel = null;
let plateModel = null;

function loadModel(path) {
  return new Promise((resolve, reject) => {
    loader.load(
      path,
      (gltf) => {
        const model = gltf.scene;
        
        // Центрируем
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);
        
        // Масштабируем
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const targetSize = 60;
        const scale = maxDim > 0 ? targetSize / maxDim : 1;
        model.scale.set(scale, scale, scale);
        
        console.log(`Модель ${path} загружена:`, model);
        resolve(model);
      },
      undefined,
      (error) => {
        console.error(`Ошибка загрузки ${path}:`, error);
        resolve(null);
      }
    );
  });
}

async function loadAllModels() {
  [oxygenModel, foodModel, waterModel, screwModel, plateModel] = await Promise.all([
    loadModel('oxygen_cylinder.glb'),
    loadModel('food.glb'),
    loadModel('water_bottle.glb'),
    loadModel('screw.glb'),
    loadModel('metal_plate.glb')
  ]);
  scatter(35);
}

loadAllModels();

function spawnPick(type, pos) {
  let mesh;
  
  if (type === 'oxygen') {
    if (oxygenModel) {
      mesh = oxygenModel.clone();
      mesh.traverse((child) => {
        if (child.isMesh) child.material = child.material.clone();
      });
    } else {
      const g = new THREE.SphereGeometry(30, 12, 8);
      const m = new THREE.MeshPhongMaterial({color: 0x5fdcff, shininess: 50, emissive: 0x0a3d66});
      mesh = new THREE.Mesh(g, m);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(22, 4, 8, 60), new THREE.MeshBasicMaterial({color: 0x0b98ff}));
      ring.rotation.x = Math.PI / 2; ring.position.y = -7; mesh.add(ring);
    }
  } 
  else if (type === 'food') {
    if (foodModel) {
      mesh = foodModel.clone();
      mesh.traverse((child) => {
        if (child.isMesh) child.material = child.material.clone();
      });
    } else {
      const g = new THREE.BoxGeometry(45, 45, 45);
      const m = new THREE.MeshPhongMaterial({color: 0xffaa88, shininess: 40, emissive: 0x663311});
      mesh = new THREE.Mesh(g, m);
    }
  } 
  else if (type === 'water') {
    if (waterModel) {
      mesh = waterModel.clone();
      mesh.traverse((child) => {
        if (child.isMesh) child.material = child.material.clone();
      });
    } else {
      const g = new THREE.BoxGeometry(25, 70, 25);
      const m = new THREE.MeshPhongMaterial({color: 0x88ddff, shininess: 60, emissive: 0x114466});
      mesh = new THREE.Mesh(g, m);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 20), new THREE.MeshBasicMaterial({color: 0x113344}));
      cap.position.y = 40;
      mesh.add(cap);
    }
  } 
  else if (type === 'plate') {
    if (plateModel) {
      mesh = plateModel.clone();
      mesh.traverse((child) => {
        if (child.isMesh) child.material = child.material.clone();
      });
    } else {
      const g = new THREE.BoxGeometry(60, 4, 40);
      const m = new THREE.MeshPhongMaterial({color: 0xffddaa, shininess: 100, emissive: 0x664411});
      mesh = new THREE.Mesh(g, m);
    }
  } 
  else if (type === 'screw') {
    if (screwModel) {
      mesh = screwModel.clone();
      mesh.traverse((child) => {
        if (child.isMesh) child.material = child.material.clone();
      });
    } else {
      const group = new THREE.Group();
      const bodyGeo = new THREE.CylinderGeometry(6, 8, 25, 12);
      const bodyMat = new THREE.MeshPhongMaterial({color: 0xffcc99, shininess: 120, emissive: 0x552200});
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.rotation.x = Math.PI / 2;
      group.add(body);
      
      const headGeo = new THREE.CylinderGeometry(12, 12, 8, 12);
      const headMat = new THREE.MeshPhongMaterial({color: 0xffaa66, shininess: 140, emissive: 0x442200});
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.y = 16;
      group.add(head);
      
      const slotGeo = new THREE.BoxGeometry(10, 2, 6);
      const slotMat = new THREE.MeshBasicMaterial({color: 0x331100});
      const slot = new THREE.Mesh(slotGeo, slotMat);
      slot.position.y = 16;
      group.add(slot);
      
      for (let i = 0; i < 6; i++) {
        const ribGeo = new THREE.BoxGeometry(1.5, 20, 3);
        const rib = new THREE.Mesh(ribGeo, bodyMat);
        const angle = (i / 6) * Math.PI * 2;
        rib.position.set(Math.cos(angle) * 7, 0, Math.sin(angle) * 7);
        group.add(rib);
      }
      mesh = group;
    }
  }
  
  mesh.userData = {
    pickup: type,
    typeName: type === 'oxygen' ? 'Баллон кислорода' : 
              type === 'food' ? 'Порция еды' : 
              type === 'water' ? 'Бутылка воды' :
              type === 'plate' ? 'Металлическая пластина' : 'Шурупы',
    isHighlighted: false
  };
  mesh.position.copy(pos);
  mesh.rotation.set(Math.random() * 2, Math.random() * 2, Math.random() * 2);
  pickups.add(mesh);
  return mesh;
}

let highlightedItem = null;
const highlightMaterial = new THREE.MeshPhongMaterial({ 
  color: 0xffffff,
  emissive: 0x444444,
  emissiveIntensity: 0.5,
  transparent: true,
  opacity: 0.8
});

function updateItemHighlighting() {
  if (inventoryOpen || craftOpen || placingPlatform || !gameRunning) return;
  
  const playerPos = camera.position;
  
  if (highlightedItem) {
    highlightedItem.traverse((child) => {
      if (child.isMesh && child.userData.originalMaterial) {
        child.material = child.userData.originalMaterial;
      }
    });
    highlightedItem.userData.isHighlighted = false;
    highlightedItem = null;
  }
  
  let closestItem = null;
  let minDistance = 300;
  
  pickups.children.forEach(item => {
    const distance = playerPos.distanceTo(item.position);
    if (distance < minDistance) {
      minDistance = distance;
      closestItem = item;
    }
  });
  
  if (closestItem) {
    closestItem.traverse((child) => {
      if (child.isMesh) {
        child.userData.originalMaterial = child.material;
        child.material = highlightMaterial.clone();
      }
    });
    closestItem.userData.isHighlighted = true;
    highlightedItem = closestItem;
    
    document.getElementById('interactionHint').style.display = 'block';
    document.getElementById('itemName').textContent = closestItem.userData.typeName;
    document.getElementById('itemName').style.display = 'block';
  } else {
    document.getElementById('interactionHint').style.display = 'none';
    document.getElementById('itemName').style.display = 'none';
  }
}

/* Инвентарь */
const inventory = { oxygen: 0, food: 0, water: 0, plate: 0, screw: 0, platform: 0 };
const quickSlots = {1: null, 2: null, 3: null};

const recipes = {
  platform: { plate: 4, screw: 8, time: 5, result: 'platform' }
};

const inventoryElement = document.getElementById('inventory');
const craftMenu = document.getElementById('craftMenu');
const body = document.body;

function toggleInventory() {
  if (!gameRunning) return;
  inventoryOpen = !inventoryOpen;
  inventoryElement.classList.toggle('open');
  body.classList.toggle('inventory-open', inventoryOpen);
  
  if (inventoryOpen) {
    renderer.domElement.style.cursor = 'default';
    document.exitPointerLock();
    document.getElementById('craftInstruction').classList.add('show');
  } else {
    if (isLocked && !craftOpen && !placingPlatform && gameRunning) {
      renderer.domElement.style.cursor = 'none';
      renderer.domElement.requestPointerLock();
    }
    document.getElementById('craftInstruction').classList.remove('show');
  }
}

function toggleCraft() {
  if (!gameRunning) return;
  craftOpen = !craftOpen;
  craftMenu.classList.toggle('open');
  body.classList.toggle('craft-open', craftOpen);
  
  if (craftOpen) {
    renderer.domElement.style.cursor = 'default';
    document.exitPointerLock();
  } else {
    if (isLocked && !inventoryOpen && !placingPlatform && gameRunning) {
      renderer.domElement.style.cursor = 'none';
      renderer.domElement.requestPointerLock();
    }
  }
}

function updateInventoryDisplay() {
  inventoryElement.querySelectorAll('.inventory-slot').forEach(slot => {
    const type = slot.dataset.type;
    slot.querySelector('.item-count').textContent = inventory[type] || 0;
  });
  updateQuickSlotsDisplay();
  updateCraftUI();
}

function updateQuickSlotsDisplay() {
  document.querySelectorAll('.quick-slot').forEach(slot => {
    const slotNum = slot.dataset.slot;
    slot.classList.toggle('selected', parseInt(slotNum) === selectedQuickSlot);
    slot.innerHTML = slotNum;
    const item = quickSlots[slotNum];
    if (item) {
      slot.innerHTML = `<div class="item-icon" style="color:${getItemColor(item.type)}">${getItemIcon(item.type)}</div><div class="item-count">${item.count}</div>`;
    }
  });
}

function getItemIcon(type) {
  return type === 'oxygen' ? '○' : type === 'food' ? '□' : type === 'water' ? '▽' : type === 'plate' ? '⟨' : type === 'screw' ? '✚' : type === 'platform' ? '⬜' : '';
}

function getItemColor(type) {
  return type === 'oxygen' ? '#5fdcff' : type === 'food' ? '#ffaa88' : type === 'water' ? '#88ddff' : type === 'plate' ? '#ffddaa' : type === 'screw' ? '#ffcc99' : '#ffaa00';
}

function updateCraftUI() {
  const plateCount = inventory.plate;
  const screwCount = inventory.screw;
  document.getElementById('craftPlate').textContent = `${plateCount}/4`;
  document.getElementById('craftScrew').textContent = `${screwCount}/8`;
  
  const enoughPlate = plateCount >= 4;
  const enoughScrew = screwCount >= 8;
  const craftButton = document.getElementById('craftButton');
  craftButton.disabled = !(enoughPlate && enoughScrew && !crafting);
  
  const materials = document.querySelectorAll('.craft-item .material');
  materials[0].classList.toggle('enough', enoughPlate);
  materials[1].classList.toggle('enough', enoughScrew);
}

function startCrafting() {
  if (crafting || inventory.plate < 4 || inventory.screw < 8 || !craftOpen) return;
  crafting = true;
  document.getElementById('craftButton').disabled = true;
}

function handleInventoryClick(e) {
  if (placingPlatform || !inventoryOpen) return;
  const slot = e.target.closest('.inventory-slot');
  if (slot && e.button === 0) {
    const type = slot.dataset.type;
    if (inventory[type] > 0) {
      if (!quickSlots[selectedQuickSlot]) {
        quickSlots[selectedQuickSlot] = { type, count: 1 };
        inventory[type]--;
      } else if (quickSlots[selectedQuickSlot].type === type) {
        quickSlots[selectedQuickSlot].count++;
        inventory[type]--;
      }
      updateInventoryDisplay();
    }
  }
}

function handleQuickSlotClick(e) {
  if (!gameRunning || placingPlatform) return;
  const slot = e.target.closest('.quick-slot');
  if (!slot) return;
  
  const slotNum = slot.dataset.slot;
  const item = quickSlots[slotNum];
  if (!item) return;
  
  if (e.button === 0) {
    useQuickSlotItem(slotNum);
  } else if (e.button === 2) {
    inventory[item.type]++;
    item.count--;
    if (item.count <= 0) quickSlots[slotNum] = null;
    updateInventoryDisplay();
  }
  e.preventDefault();
}

function useQuickSlotItem(slotNum) {
  const item = quickSlots[slotNum];
  if (!item || inventoryOpen || craftOpen || placingPlatform || inGravityZone) return;
  
  if (item.type === 'oxygen' && oxygen < 100) {
    oxygen = Math.min(100, oxygen + 50);
    item.count--;
    if (item.count <= 0) quickSlots[slotNum] = null;
  } else if (item.type === 'food' && food < 100) {
    food = Math.min(100, food + 50);
    item.count--;
    if (item.count <= 0) quickSlots[slotNum] = null;
  } else if (item.type === 'water' && water < 100) {
    water = Math.min(100, water + 50);
    item.count--;
    if (item.count <= 0) quickSlots[slotNum] = null;
  } else if (item.type === 'platform') {
    placingPlatform = true;
    createPlatformGhost();
    renderer.domElement.style.cursor = 'crosshair';
    document.exitPointerLock();
  }
  updateInventoryDisplay();
}

inventoryElement.addEventListener('click', handleInventoryClick);
document.getElementById('quickSlots').addEventListener('mousedown', handleQuickSlotClick);
document.getElementById('quickSlots').addEventListener('contextmenu', e => e.preventDefault());

document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyI') toggleInventory();
  if (e.code === 'KeyQ') toggleCraft();
  if (e.code === 'Digit1') { selectedQuickSlot = 1; updateQuickSlotsDisplay(); }
  if (e.code === 'Digit2') { selectedQuickSlot = 2; updateQuickSlotsDisplay(); }
  if (e.code === 'Digit3') { selectedQuickSlot = 3; updateQuickSlotsDisplay(); }
  
  if (e.code === 'KeyR' && !inventoryOpen && !craftOpen && !placingPlatform && !inGravityZone) {
    useQuickSlotItem(selectedQuickSlot);
  }
});

/* ---- Гравитация ---- */
function updateGravity(delta) {
  const playerPos = camera.position;
  let planetDist = playerPos.distanceTo(planet.position);
  let starDist = playerPos.distanceTo(star.position);
  
  const planetGravityZone = 35000;
  const starGravityZone = 45000;
  
  if (inGravityZone) {
    if ((gravityBody === 'planet' && planetDist > planetGravityZone) || 
        (gravityBody === 'star' && starDist > starGravityZone)) {
      inGravityZone = false;
      gravityBody = null;
      gravityScreenRed = 0;
    }
  }
  
  if (!inGravityZone) {
    if (planetDist < planetGravityZone) {
      inGravityZone = true;
      gravityBody = 'planet';
      gravityScreenRed = 0;
    } else if (starDist < starGravityZone) {
      inGravityZone = true;
      gravityBody = 'star';
      gravityScreenRed = 0;
    }
  }
  
  if (inGravityZone) {
    const targetBody = gravityBody === 'planet' ? planet.position : star.position;
    const direction = new THREE.Vector3().subVectors(targetBody, playerPos).normalize();
    const gravityStrength = 150 * delta;
    
    camera.position.add(direction.multiplyScalar(gravityStrength));
    
    gravityScreenRed = Math.min(1, gravityScreenRed + delta * 2);
    health = Math.max(0, health - 80 * delta);
  } else {
    gravityScreenRed = Math.max(0, gravityScreenRed - delta * 3);
  }
  
  renderer.domElement.style.filter = `brightness(1) sepia(${gravityScreenRed * 0.8}) hue-rotate(${gravityScreenRed * 30}deg) saturate(${1 + gravityScreenRed * 2})`;
}

function createPlatformGhost() {
  const platformGeo = new THREE.BoxGeometry(200, 5, 200);
  const platformMat = new THREE.MeshPhongMaterial({ 
    color: 0xffaa00, 
    transparent: true, 
    opacity: 0.6,
    shininess: 100
  });
  platformGhost = new THREE.Mesh(platformGeo, platformMat);
  scene.add(platformGhost);
}

function placePlatform() {
  if (!platformGhost || !gameRunning || inGravityZone) return;
  
  const platformGeo = new THREE.BoxGeometry(200, 5, 200);
  const platformMat = new THREE.MeshPhongMaterial({ 
    color: 0xffaa00, 
    shininess: 100
  });
  const platform = new THREE.Mesh(platformGeo, platformMat);
  platform.position.copy(platformGhost.position);
  platform.rotation.y = yaw;
  placedPlatforms.add(platform);
  
  const slotItem = quickSlots[selectedQuickSlot];
  if (slotItem) {
    slotItem.count--;
    if (slotItem.count <= 0) quickSlots[selectedQuickSlot] = null;
  }
  
  scene.remove(platformGhost);
  platformGhost = null;
  placingPlatform = false;
  renderer.domElement.style.cursor = 'none';
  renderer.domElement.requestPointerLock();
  updateInventoryDisplay();
}

function updatePlatformGhost() {
  if (!platformGhost || !placingPlatform || !gameRunning) return;
  
  platformGhost.position.copy(camera.position);
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  platformGhost.position.add(direction.multiplyScalar(100));
  platformGhost.rotation.y = yaw;
}

document.addEventListener('keydown', (e) => {
  if (!gameRunning || e.code !== 'KeyE' || !highlightedItem || inventoryOpen || craftOpen || placingPlatform || inGravityZone) return;
  
  const type = highlightedItem.userData.pickup;
  const startPos = highlightedItem.position.clone();
  const playerPos = camera.position.clone();
  const duration = 500;
  const startTime = performance.now();
  
  function animateCollection() {
    const currentTime = performance.now();
    const progress = Math.min(1, (currentTime - startTime) / duration);
    
    highlightedItem.position.lerpVectors(startPos, playerPos, progress);
    highlightedItem.scale.setScalar(1 - progress * 0.8);
    
    if (progress < 1) {
      requestAnimationFrame(animateCollection);
    } else {
      inventory[type]++;
      updateInventoryDisplay();
      pickups.remove(highlightedItem);
      highlightedItem = null;
      document.getElementById('cO').textContent = inventory.oxygen;
      document.getElementById('cF').textContent = inventory.food;
      document.getElementById('cW').textContent = inventory.water;
      document.getElementById('interactionHint').style.display = 'none';
      document.getElementById('itemName').style.display = 'none';
    }
  }
  animateCollection();
});

// Увеличенное расстояние генерации (в 1.5 раза)
const spawnDistance = 2000 * 1.5; // 3000
const maxPickups = 60;

function managePickups() {
  if (!gameRunning) return;
  const playerPos = camera.position;
  for (let i = pickups.children.length - 1; i >= 0; i--) {
    const item = pickups.children[i];
    if (item.position.distanceTo(playerPos) > spawnDistance * 2) {
      pickups.remove(item);
    }
  }
  if (pickups.children.length < maxPickups) {
    const angle = Math.random() * Math.PI * 2;
    const dist = spawnDistance * 0.8 + Math.random() * spawnDistance * 0.4;
    const y = (Math.random() - 0.5) * 600 + 150; // Увеличена высота разброса
    const posSpawn = new THREE.Vector3(
      playerPos.x + Math.cos(angle) * dist,
      playerPos.y + y,
      playerPos.z + Math.sin(angle) * dist
    );
    const t = Math.random();
    // Редкость: кислород и еда — редко (до 0.15 и 0.25)
    const type = t < 0.08 ? 'oxygen' : 
                 t < 0.15 ? 'food' : 
                 t < 0.45 ? 'water' : 
                 t < 0.75 ? 'plate' : 'screw';
    spawnPick(type, posSpawn);
  }
}

function scatter(n) {
  const playerPos = camera.position;
  for (let i = 0; i < n; i++) {
    const phi = Math.random() * Math.PI * 2;
    const theta = (Math.random() * 0.6 + 0.2) * Math.PI;
    const r = 750 + Math.random() * 2250; // Увеличено в 1.5 раза
    const p = new THREE.Vector3(
      playerPos.x + Math.sin(theta) * Math.cos(phi) * r,
      playerPos.y + Math.cos(theta) * r + 150 * (Math.random() - 0.5),
      playerPos.z + Math.sin(theta) * Math.sin(phi) * r
    );
    const t = Math.random();
    const type = t < 0.08 ? 'oxygen' : 
                 t < 0.15 ? 'food' : 
                 t < 0.45 ? 'water' : 
                 t < 0.75 ? 'plate' : 'screw';
    spawnPick(type, p);
  }
}

function animatePickups(delta) {
  pickups.children.forEach(m => {
    m.rotation.x += 0.2 * delta;
    m.rotation.y += 0.14 * delta;
    m.position.x += Math.sin((m.id || m.uuid.length) + performance.now() * 0.0001) * 0.02 * delta;
  });
  placedPlatforms.children.forEach(p => {
    p.rotation.y += 0.005;
  });
}

const velocity = new THREE.Vector3();
const move = {forward: false, back: false, left: false, right: false, up: false, down: false, shift: false};
let baseSpeed = 10;
const damping = 0.95;

function onKey(e, down) {
  if (!gameRunning || inventoryOpen || craftOpen || placingPlatform || inGravityZone) return;
  const v = down;
  if (e.code === 'KeyW') move.forward = v;
  if (e.code === 'KeyS') move.back = v;
  if (e.code === 'KeyA') move.left = v;
  if (e.code === 'KeyD') move.right = v;
  if (e.code === 'Space') move.up = v;
  if (e.code === 'ControlLeft' || e.code === 'ControlRight') move.down = v;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') move.shift = v;
}
window.addEventListener('keydown', e => onKey(e, true));
window.addEventListener('keyup', e => onKey(e, false));

let oxygen = 100, food = 100, water = 100, health = 100;
let oxyDecayBase = 100 / 90;

const elO = document.getElementById('oxyFill');
const elF = document.getElementById('foodFill');
const elW = document.getElementById('waterFill');
const elH = document.getElementById('healthFill');
const elOVal = document.getElementById('oxyVal');
const elFVal = document.getElementById('foodVal');
const elWVal = document.getElementById('waterVal');
const elHVal = document.getElementById('healthVal');
const cO = document.getElementById('cO');
const cF = document.getElementById('cF');
const cW = document.getElementById('cW');
const timeEl = document.getElementById('time');
const planetDistanceEl = document.getElementById('planetDistance');
const starDistanceEl = document.getElementById('starDistance');

let elapsed = 0;
let last = performance.now();
let shakeTimer = 0;

function restartGame() {
  oxygen = 100; food = 100; water = 100; health = 100;
  inventory.oxygen = 0; inventory.food = 0; inventory.water = 0; 
  inventory.plate = 0; inventory.screw = 0; inventory.platform = 0;
  quickSlots[1] = null; quickSlots[2] = null; quickSlots[3] = null;
  camera.position.set(0, 200, 800);
  yaw = 0; pitch = 0;
  pickups.clear();
  placedPlatforms.clear();
  dustParticles.clear();
  scatter(35);
  for (let i = 0; i < 20; i++) {
    const center = new THREE.Vector3(
      (Math.random() - 0.5) * 200000,
      200 + Math.random() * 400,
      (Math.random() - 0.5) * 200000
    );
    dustParticles.add(generateDustCloud(center, 8000 + Math.random() * 12000));
  }
  inGravityZone = false;
  gravityBody = null;
  gravityScreenRed = 0;
  boostActive = false;
  renderer.domElement.style.filter = 'none';
  updateInventoryDisplay();
  document.getElementById('gameOver').style.display = 'none';
  body.classList.remove('game-over');
  gameRunning = true;
  elapsed = 0;
  inventoryOpen = false; craftOpen = false; placingPlatform = false; crafting = false;
  inventoryElement.classList.remove('open');
  craftMenu.classList.remove('open');
  body.classList.remove('inventory-open');
  body.classList.remove('craft-open');
  if (platformGhost) { scene.remove(platformGhost); platformGhost = null; }
  renderer.domElement.requestPointerLock();
}

document.getElementById('inventoryToggle').addEventListener('click', toggleInventory);
document.getElementById('craftToggle').addEventListener('click', toggleCraft);
document.getElementById('craftButton').addEventListener('click', startCrafting);

function loop() {
  const now = performance.now();
  let delta = Math.min((now - last) / 1000, 0.1);
  last = now;
  
  if (gameRunning) {
    elapsed += delta;
    timeEl.textContent = Math.floor(elapsed);

    const playerPos = camera.position;
    
    const planetDist = playerPos.distanceTo(planet.position) / 1000;
    const starDist = playerPos.distanceTo(star.position) / 1000;
    planetDistanceEl.textContent = Math.max(0, Math.floor(planetDist));
    starDistanceEl.textContent = Math.max(0, Math.floor(starDist));

    const hasMovement = move.forward || move.back || move.left || move.right || move.up || move.down;
    boostActive = move.shift && hasMovement;

    updateGravity(delta);

    if (!inventoryOpen && !craftOpen && !placingPlatform && !inGravityZone) {
      const dir = new THREE.Vector3();
      if (move.forward) dir.z -= 1;
      if (move.back) dir.z += 1;
      if (move.left) dir.x -= 1;
      if (move.right) dir.x += 1;
      if (move.up) dir.y += 1;
      if (move.down) dir.y -= 1;
      if (dir.lengthSq() > 0) dir.normalize();

      dir.applyEuler(camera.rotation);
      
      const currentSpeed = boostActive ? baseSpeed * 2 : baseSpeed;
      dir.multiplyScalar(currentSpeed * delta);
      velocity.add(dir);
      velocity.multiplyScalar(damping);
      camera.position.add(velocity);

      const distFromPlanet = playerPos.distanceTo(planet.position);
      if (distFromPlanet < 24200 && !inGravityZone) {
        const push = playerPos.clone().sub(planet.position).setLength(24200 - distFromPlanet + 1);
        playerPos.add(push);
        velocity.multiplyScalar(0.6);
      }
    }

    animatePickups(delta);
    updateItemHighlighting();
    managePickups();
    updatePlatformGhost();
    
    if (Math.floor(elapsed) % 10 === 0 && Math.random() < 0.3) {
      addDustCloudsAroundPlayer();
    }

    if (crafting && craftOpen) {
      craftProgress += delta;
      if (craftProgress >= recipes.platform.time) {
        inventory.plate -= 4;
        inventory.screw -= 8;
        inventory.platform++;
        crafting = false;
        craftProgress = 0;
        updateInventoryDisplay();
        updateCraftUI();
      }
    }

    const oxyMultiplier = boostActive ? 2 : 1;
    oxygen = Math.max(0, oxygen - oxyDecayBase * delta * oxyMultiplier);
    food = Math.max(0, food - (100 / 500) * delta);
    water = Math.max(0, water - (100 / 140) * delta);

    const criticalOxygen = oxygen <= 10;
    const criticalFood = food <= 10;
    const criticalWater = water <= 10;
    
    if (criticalOxygen || criticalFood || criticalWater) {
      health = Math.max(0, health - 2.0 * delta);
    } else {
      health = Math.min(100, health + 0.3 * delta);
    }

    if (oxygen < 20 || food < 20 || water < 20 || health < 20) {
      shakeTimer += delta;
      if (shakeTimer > 0.1) {
        camera.position.x += (Math.random() - 0.5) * 0.5;
        camera.position.y += (Math.random() - 0.5) * 0.5;
        shakeTimer = 0;
      }
    }

    if (health <= 0) {
      gameRunning = false;
      document.getElementById('gameOver').style.display = 'flex';
      body.classList.add('game-over');
      renderer.domElement.style.cursor = 'default';
      document.exitPointerLock();
    }

    elO.style.width = oxygen + '%';
    elF.style.width = food + '%';
    elW.style.width = water + '%';
    elH.style.width = health + '%';
    elOVal.textContent = Math.floor(oxygen);
    elFVal.textContent = Math.floor(food);
    elWVal.textContent = Math.floor(water);
    elHVal.textContent = Math.floor(health);
  }

  star.rotation.y += 0.005;
  starGlows.forEach((glow, i) => {
    glow.rotation.y += (i % 2 === 0 ? 0.01 : -0.007) * (i + 1) * 0.3;
  });
  planet.rotation.y += 0.003;

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

loop();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.domElement.addEventListener('click', () => {
  if (!inventoryOpen && !craftOpen && !placingPlatform && gameRunning) {
    renderer.domElement.requestPointerLock();
  }
});

document.getElementById('restartButton').addEventListener('click', restartGame);