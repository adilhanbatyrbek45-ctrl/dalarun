const $ = (id) => document.getElementById(id);
const dom = {
  canvas: $('world'), hud: $('hud'), score: $('score'), topic: $('topic'), dots: $('mistake-dots'), pauseButton: $('pause-button'),
  qHud: $('question-hud'), qNumber: $('question-number'), qCategory: $('question-category'), qText: $('question-text'), timeFill: $('time-fill'),
  choiceStrip: $('choice-strip'), cards: [...document.querySelectorAll('.choice-card')], feedback: $('feedback'), mobileControls: $('mobile-controls'),
  start: $('start-screen'), how: $('how-screen'), pause: $('pause-screen'), result: $('result-screen'), startButton: $('start-button'),
  loadError: $('load-error'), bestStart: $('best-start'), finalScore: $('final-score'), resultTitle: $('result-title'), resultCopy: $('result-copy'),
  bestResult: $('best-result'),
};

const TOPIC_NAMES = { HTML: 'HTML', CSS: 'CSS', JavaScript: 'JavaScript' };
const BEST_KEY = 'dala-run-best-v1';
const QUESTION_SECONDS = 12.5;
const LANES = [-2.65, 0, 2.65];
let THREE;
let bank = [];
let session = [];
let scene, camera, renderer, player, gate, laneDashes = [], movingScenery = [];
let lane = 1, score = 0, mistakes = 0, questionIndex = 0, correctCount = 0, timeLeft = QUESTION_SECONDS;
let gameState = 'menu', previousTime = 0, travel = 0, avatarParts = {};
let lastTouchX = null;

function setLoadError(text) { dom.loadError.textContent = text; dom.loadError.classList.remove('hidden'); }
function show(section) {
  for (const item of [dom.start, dom.how, dom.pause, dom.result]) item.classList.add('hidden');
  if (section) section.classList.remove('hidden');
}

try {
  THREE = await import('three');
  initScene();
  const response = await fetch('./questions.json');
  if (!response.ok) throw new Error('questions.json файлы ашылмады. Жобаны жергілікті сервер арқылы іске қос.');
  bank = await response.json();
  validateBank(bank);
  dom.bestStart.textContent = `Үздік нәтиже: ${getBest()}`;
  dom.startButton.disabled = false;
  requestAnimationFrame(animate);
} catch (error) {
  console.error(error);
  setLoadError('3D көрініс жүктелмеді. Интернет байланысын тексеріп, WebGL қолдайтын браузерде қайта аш.');
  dom.startButton.disabled = true;
}

function validateBank(items) {
  const counts = { HTML: 0, CSS: 0, JavaScript: 0 };
  const stems = new Set();
  if (!Array.isArray(items) || items.length !== 150) throw new Error('Сұрақтар қорында 150 тапсырма болуы керек.');
  for (const q of items) {
    if (!counts.hasOwnProperty(q.topic) || !q.question || !q.correctAnswer || !Array.isArray(q.distractors) || q.distractors.length !== 2) throw new Error('Сұрақтар қорында қате пішімделген тапсырма бар.');
    if (stems.has(q.question)) throw new Error('Сұрақтар қорында қайталанатын тапсырма бар.');
    stems.add(q.question);
    counts[q.topic]++;
  }
  if (Object.values(counts).some(n => n !== 50)) throw new Error('Әр тақырыпта 50 сұрақ болуы керек.');
}

function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#a9dfe9');
  scene.fog = new THREE.Fog('#c3e2d3', 54, 160);
  camera = new THREE.PerspectiveCamera(54, innerWidth / innerHeight, 0.1, 220);
  camera.position.set(0, 5.8, 11.5);
  camera.lookAt(0, 1.1, -17);

  renderer = new THREE.WebGLRenderer({ canvas: dom.canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.8));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  scene.add(new THREE.HemisphereLight('#eaffef', '#8b6441', 2.0));
  const sun = new THREE.DirectionalLight('#fff1ce', 3.3);
  sun.position.set(-15, 25, 10);
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 280), new THREE.MeshStandardMaterial({ color: '#b8a56a', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.12, -95); scene.add(ground);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(9.7, 220), new THREE.MeshStandardMaterial({ color: '#aa8b61', roughness: 0.97 }));
  path.rotation.x = -Math.PI / 2; path.position.set(0, -0.04, -87); scene.add(path);
  const vergeMaterial = new THREE.MeshStandardMaterial({ color: '#d0b976', roughness: 1 });
  for (const side of [-1, 1]) {
    const verge = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 220), vergeMaterial);
    verge.position.set(side * 5.03, 0.01, -87); scene.add(verge);
  }
  const lineMaterial = new THREE.MeshStandardMaterial({ color: '#f8ebcb', emissive: '#634c28', emissiveIntensity: 0.18, roughness: 0.8 });
  for (const x of [-1.62, 1.62]) {
    for (let i = 0; i < 32; i++) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.025, 2.0), lineMaterial);
      dash.position.set(x, 0.035, 9 - i * 6.5); scene.add(dash); laneDashes.push(dash);
    }
  }

  makeMountains();
  makeDecor();
  makeRunner();
  makeGate();
  window.addEventListener('resize', resize);
}

function makeMountains() {
  const group = new THREE.Group();
  const palettes = ['#a5b798', '#8fa891', '#75948b', '#b8b287'];
  for (let i = 0; i < 15; i++) {
    const w = 20 + Math.random() * 19, h = 13 + Math.random() * 18;
    const geo = new THREE.BufferGeometry();
    const vertices = [
      -w/2, 0, 0,  -w*.18, h*.65, 0,  -w*.4, h*.47, -1,
      -w/2, 0, 0,  -w*.4, h*.47, -1,  w/2, 0, 0,
      -w*.18, h*.65, 0,  w*.15, h, -0.7,  w*.4, h*.42, -1,
      -w*.18, h*.65, 0,  w*.4, h*.42, -1,  w/2, 0, 0,
    ];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: palettes[i % palettes.length], flatShading: true, side: THREE.DoubleSide, roughness: 1 }));
    mesh.position.set((i - 7) * 18 + (Math.random() - .5) * 8, 0, -99 - Math.random() * 8); group.add(mesh);
  }
  scene.add(group);
}

function makeYurt() {
  const group = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.12, 1.28, 12), new THREE.MeshStandardMaterial({ color: '#f0ddae', roughness: 1 }));
  wall.position.y = .68; group.add(wall);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.15, .8, 12), new THREE.MeshStandardMaterial({ color: '#ab7951', roughness: 1 }));
  roof.position.y = 1.72; group.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(.38, .72, .06), new THREE.MeshStandardMaterial({ color: '#735139' }));
  door.position.set(0, .4, 1.05); group.add(door);
  const band = new THREE.Mesh(new THREE.TorusGeometry(1.02, .045, 6, 24), new THREE.MeshStandardMaterial({ color: '#bb5940', roughness: 1 }));
  band.rotation.x = Math.PI / 2; band.position.y = 1.1; group.add(band);
  return group;
}

function makeTree() {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.09, .16, 1.8, 5), new THREE.MeshStandardMaterial({ color: '#785c3a' }));
  trunk.position.y = .86; group.add(trunk);
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(.78, 0), new THREE.MeshStandardMaterial({ color: '#73845a', flatShading: true }));
  crown.position.set(.18, 1.95, 0); crown.scale.set(1.2, 1.35, 1); group.add(crown);
  const crown2 = crown.clone(); crown2.position.set(-.38, 1.55, .12); crown2.scale.set(.85, .8, .85); group.add(crown2);
  return group;
}

function makeDecor() {
  for (let i = 0; i < 34; i++) {
    const side = i % 2 ? 1 : -1;
    const object = i % 9 === 0 ? makeYurt() : makeTree();
    const scale = i % 9 === 0 ? .74 + Math.random() * .22 : .7 + Math.random() * .6;
    object.scale.setScalar(scale);
    object.position.set(side * (7 + Math.random() * 8), 0, -8 - i * 4.5 - Math.random() * 14);
    object.rotation.y = Math.random() * Math.PI * 2;
    scene.add(object); movingScenery.push(object);
  }
  const stoneMat = new THREE.MeshStandardMaterial({ color: '#d8bd73', roughness: 1, flatShading: true });
  for (let i = 0; i < 38; i++) {
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(.16 + Math.random()*.2, .7 + Math.random()*.75, 4), stoneMat);
    const side = i % 2 ? 1 : -1;
    tuft.position.set(side * (5.5 + Math.random() * 6), .25, -Math.random()*145);
    tuft.rotation.z = (Math.random() - .5) * .28;
    scene.add(tuft); movingScenery.push(tuft);
  }
}

function makeRunner() {
  player = new THREE.Group(); scene.add(player); player.position.set(0, 0, 1.2);
  const mat = (color, roughness=.8) => new THREE.MeshStandardMaterial({ color, roughness });
  const skin = mat('#d8a06f'), teal = mat('#206b65'), dark = mat('#34524b'), orange = mat('#e6a34b'), cream = mat('#f2d79e');
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(.33, .44, .82, 9), teal); torso.position.y = 1.32; player.add(torso);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(.34, .065, 6, 12), orange); collar.position.y = 1.68; collar.rotation.x = Math.PI/2; player.add(collar);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.29, 12, 10), skin); head.position.y = 1.97; player.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(.31, 10, 6, 0, Math.PI*2, 0, Math.PI/2), teal); cap.position.y = 2.13; player.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(.54, .055, .27), teal); brim.position.set(0, 2.12, .21); player.add(brim);
  const scarf = new THREE.Mesh(new THREE.BoxGeometry(.47, .16, .5), orange); scarf.position.set(0, 1.65, .03); player.add(scarf);
  const eyeMat = mat('#193b3b');
  for (const x of [-.105,.105]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(.025, 6, 5), eyeMat); eye.position.set(x, 2.0, .266); player.add(eye); }
  const limbs=[];
  for (const side of [-1,1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(.09,.4,3,6), teal); arm.position.set(side*.42,1.34,.02); arm.rotation.z=side*.2; player.add(arm); limbs.push({mesh:arm,side,kind:'arm'});
    const hand = new THREE.Mesh(new THREE.SphereGeometry(.105,7,6),skin); hand.position.set(side*.47,1.08,.02); player.add(hand);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.115,.44,3,6),dark); leg.position.set(side*.18,.55,0); player.add(leg); limbs.push({mesh:leg,side,kind:'leg'});
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(.27,.13,.42),cream); shoe.position.set(side*.18,.13,.08); player.add(shoe);
  }
  avatarParts.limbs=limbs;
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.68,18), new THREE.MeshBasicMaterial({color:'#51452d',transparent:true,opacity:.19})); shadow.rotation.x=-Math.PI/2; shadow.position.set(0,.015,0); player.add(shadow);
}

function makeGate() {
  gate = new THREE.Group(); scene.add(gate);
  const postMat = new THREE.MeshStandardMaterial({color:'#bb7947',roughness:.65});
  for (let i=0;i<3;i++) {
    const x=LANES[i];
    const post=new THREE.Mesh(new THREE.CylinderGeometry(.06,.09,2.7,7),postMat); post.position.set(x,1.35,0); gate.add(post);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.32,.055,7,18),new THREE.MeshStandardMaterial({color:i===1?'#fff0b9':'#d7e9c5',emissive:'#826438',emissiveIntensity:.25}));
    ring.position.set(x,2.75,0); gate.add(ring);
    const foot=new THREE.Mesh(new THREE.BoxGeometry(1.2,.08,.45),postMat); foot.position.set(x,.06,0); gate.add(foot);
  }
  const beam=new THREE.Mesh(new THREE.BoxGeometry(8.8,.11,.12),postMat); beam.position.set(0,2.72,0); gate.add(beam);
  gate.position.z=-44;
}

function resize() {
  if (!renderer || !camera) return;
  camera.aspect=innerWidth/innerHeight; camera.fov=innerWidth<650?58:54; camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.8)); renderer.setSize(innerWidth,innerHeight);
}

function animate(now) {
  requestAnimationFrame(animate);
  const dt=Math.min((now-previousTime)/1000||0,0.05); previousTime=now;
  if (gameState==='playing') updateGame(dt);
  if (player) {
    player.position.x += (LANES[lane]-player.position.x)*Math.min(1,dt*9);
    const run=Math.sin(now*.012);
    for (const part of avatarParts.limbs||[]) part.mesh.rotation.x=run*(part.kind==='leg'?.68:.42)*part.side;
    player.position.y=Math.abs(run)*.035;
  }
  if (renderer && scene && camera) renderer.render(scene,camera);
}

function updateGame(dt) {
  const pace=1+Math.min(questionIndex,95)*.004;
  const speed=7.1*pace;
  travel += speed*dt;
  for (const dash of laneDashes) { dash.position.z += speed*dt; if (dash.position.z>13) dash.position.z-=208; }
  for (const object of movingScenery) { object.position.z += speed*dt; if (object.position.z>14) object.position.z-=178; }
  if (gate) gate.position.z=Math.min(2,-44+((QUESTION_SECONDS-timeLeft)/QUESTION_SECONDS)*46);
  timeLeft-=dt;
  dom.timeFill.style.width=`${Math.max(0,timeLeft/QUESTION_SECONDS*100)}%`;
  if (timeLeft<=0) answerQuestion();
}

function shuffle(items) { const arr=[...items]; for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr; }
function makeSession() {
  const groups={HTML:shuffle(bank.filter(q=>q.topic==='HTML')),CSS:shuffle(bank.filter(q=>q.topic==='CSS')),JavaScript:shuffle(bank.filter(q=>q.topic==='JavaScript'))};
  const topics=shuffle(['HTML','CSS','JavaScript']);
  return Array.from({length:50},(_,i)=>topics.map(topic=>groups[topic][i])).flat();
}
function beginGame() {
  session=makeSession(); score=0; mistakes=0; correctCount=0; questionIndex=0; lane=1; timeLeft=QUESTION_SECONDS;
  gameState='playing'; travel=0; gate.position.z=-44;
  show(null); dom.hud.classList.remove('hidden'); dom.qHud.classList.remove('hidden'); dom.choiceStrip.classList.remove('hidden');
  dom.mobileControls.classList.remove('hidden'); dom.feedback.classList.add('hidden');
  displayQuestion(); updateHud();
}
function displayQuestion() {
  if (questionIndex>=session.length) { endGame(true); return; }
  lane=1; timeLeft=QUESTION_SECONDS;
  const original=session[questionIndex];
  const options=shuffle([{text:original.correctAnswer,correct:true},...original.distractors.map(text=>({text,correct:false}))]);
  session[questionIndex]={...original,options,correctLane:options.findIndex(option=>option.correct)};
  dom.qNumber.textContent=`${questionIndex+1} / ${session.length}`;
  dom.qCategory.textContent=TOPIC_NAMES[original.topic];
  dom.topic.textContent=TOPIC_NAMES[original.topic];
  dom.qText.textContent=original.question;
  dom.cards.forEach((card,index)=>{card.querySelector('p').textContent=options[index].text;card.classList.toggle('selected',index===lane);});
  dom.timeFill.style.width='100%'; gate.position.z=-44;
}
function updateHud() {
  dom.score.textContent=String(score);
  [...dom.dots.children].forEach((dot,index)=>dot.classList.toggle('used',index<mistakes));
}
function selectLane(next) {
  if (gameState!=='playing') return;
  lane=Math.max(0,Math.min(2,next));
  dom.cards.forEach((card,index)=>card.classList.toggle('selected',index===lane));
}
function moveLane(delta) { selectLane(lane+delta); }
function answerQuestion() {
  if (gameState!=='playing') return;
  gameState='feedback';
  const q=session[questionIndex];
  const correct=lane===q.correctLane;
  dom.feedback.className=`feedback ${correct?'correct':'wrong'}`;
  dom.feedback.textContent=correct?'Дұрыс! +100 ұпай':`Қате. Дұрыс жауап: ${q.options[q.correctLane].text}`;
  dom.feedback.classList.remove('hidden');
  if (correct) { score+=100; correctCount++; } else mistakes++;
  updateHud();
  setTimeout(()=>{
    dom.feedback.classList.add('hidden');
    questionIndex++;
    if (mistakes>=3) { endGame(false); return; }
    if (questionIndex>=session.length) { endGame(true); return; }
    gameState='playing'; displayQuestion();
  },1250);
}
function endGame(completed) {
  gameState='result';
  dom.hud.classList.add('hidden'); dom.qHud.classList.add('hidden'); dom.choiceStrip.classList.add('hidden'); dom.mobileControls.classList.add('hidden'); dom.feedback.classList.add('hidden');
  dom.resultTitle.textContent=completed?'Бәрекелді!':'Ойын аяқталды';
  dom.resultCopy.textContent=completed?'Барлық сұраққа жауап бердің!':'Үш қате жауап бердің. Тағы бір рет байқап көр!';
  dom.finalScore.textContent=String(score);
  const best=Math.max(getBest(),score); try { localStorage.setItem(BEST_KEY,String(best)); } catch { /* local сақтау өшірулі болса, ойын жалғасады */ }
  dom.bestResult.textContent=`Дұрыс жауап: ${correctCount} · Қате жауап: ${mistakes} · Үздік нәтиже: ${best}`;
  show(dom.result);
}
function getBest() { try { return Number(localStorage.getItem(BEST_KEY)||0); } catch { return 0; } }
function pauseGame() { if(gameState!=='playing')return; gameState='paused'; show(dom.pause); }
function resumeGame() { if(gameState!=='paused')return; gameState='playing'; show(null); }
function returnMenu() {
  gameState='menu'; dom.hud.classList.add('hidden'); dom.qHud.classList.add('hidden'); dom.choiceStrip.classList.add('hidden'); dom.mobileControls.classList.add('hidden');
  dom.bestStart.textContent=`Үздік нәтиже: ${getBest()}`; show(dom.start);
}

dom.startButton.addEventListener('click',beginGame);
dom.pauseButton.addEventListener('click',pauseGame);
$('resume-button').addEventListener('click',resumeGame);
$('quit-button').addEventListener('click',returnMenu);
$('restart-button').addEventListener('click',beginGame);
$('menu-button').addEventListener('click',returnMenu);
$('how-button').addEventListener('click',()=>show(dom.how));
$('back-how').addEventListener('click',()=>show(dom.start));
$('left-button').addEventListener('click',()=>moveLane(-1));
$('right-button').addEventListener('click',()=>moveLane(1));
window.addEventListener('keydown',(event)=>{
  if(['ArrowLeft','ArrowRight',' '].includes(event.key)) event.preventDefault();
  if(event.key==='Escape'||event.key.toLowerCase()==='p'){ if(gameState==='playing')pauseGame(); else if(gameState==='paused')resumeGame(); return; }
  if(event.key==='ArrowLeft'||event.key.toLowerCase()==='a')moveLane(-1);
  if(event.key==='ArrowRight'||event.key.toLowerCase()==='d')moveLane(1);
});
document.querySelector('.game-shell').addEventListener('touchstart',event=>{lastTouchX=event.changedTouches[0].clientX;},{passive:true});
document.querySelector('.game-shell').addEventListener('touchend',event=>{if(lastTouchX===null)return;const dx=event.changedTouches[0].clientX-lastTouchX;if(Math.abs(dx)>28)moveLane(dx<0?-1:1);lastTouchX=null;},{passive:true});
