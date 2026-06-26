
const lock = document.getElementById('lock'),
    sizeInput = document.getElementById('sizeInput'),
    countInput = document.getElementById('countInput'),
    controls = document.getElementById('controls'),
    resetBtn = document.getElementById('resetBtn'),
    solveBtn = document.getElementById('solveBtn'),
    btnDecrease = document.getElementById('btnDecreaseBlocks'),
    btnIncrease = document.getElementById('btnIncreaseBlocks'),
    prevBtn = document.getElementById('prevBtn'),
    playBtn = document.getElementById('playBtn'),
    restartSeqBtn = document.getElementById('restartSeqBtn'),
    nextBtn = document.getElementById('nextBtn'),
    stepControlsRow = document.getElementById('stepControlsRow'),
    squashLabel = document.getElementById('squashLabel'),
    squashMovesCheck = document.getElementById('squashMovesCheck'),
    statusMsg = document.getElementById('statusMsg'),
    solutionList = document.getElementById('solutionList'),
    expandBtn = document.getElementById('expandBtn'),
    inspectorRow = document.getElementById('inspectorRow'),
    PIN_RAISED = -10,
    PIN_MIDDLE = -5,
    PIN_UNDER = 1,
    LONG_PRESS_DURATION = 500,
    SHORT_PRESS_DURATION = 100,
    DRAG_THRESHOLD = 5,
    HOLE_SPACING = 36.5,
    SOLVE_TIMEOUT_MS = 5000,
    MAX_PLATES = 8,
    ONE_OVER_HOLE_SPACING = 1 / HOLE_SPACING
;

let currentSolution = null;
let currentStepIndex = 0;
let isPlaying = false;
let moveMap = [];

const gameState = {
    blocks: [],
    activeLinkerId: null,
    dragState: {
        activePlate: null,
        startInputX: 0,
        movingGroup: [],
        isDragging: false,
        longPressTimer: null,
        hasMoved: false,
    },
    isMobile: 768 >= window.innerWidth,
    lastTouchTime: 0,
    lastAction: null,
    isHovering: false
};
const pinchState = {initialDistance: 0, initialScale: 1};

if (gameState.isMobile) squashMovesCheck.checked = false;

function setStatus(text, type = 'info') {
    statusMsg.textContent = text;
    statusMsg.className = `status-message status-${type}`;
    const row = statusMsg.closest('.play-status-row');
    if ('' === text) {
        row.classList.remove('show-stretch');
    } else row.classList.add('show-stretch');
}

function clearSolutionUI() {
    currentSolution = null;
    currentStepIndex = 0;
    isPlaying = false;
    playBtn.style.display = 'none';
    playBtn.textContent = '▶ Play';
    restartSeqBtn.style.display = 'none';
    stepControlsRow.classList.remove('show-stretch');
    squashLabel.classList.remove('show-stretch');
    setStatus("", "info");
    solveBtn.disabled = false;
    gameState.blocks.forEach(b => b.el.classList.remove('is-touched', 'selected', 'linked-highlight', 'linked-highlight-reverse'));
    document.querySelectorAll('.hole.glow-white').forEach(h => h.classList.remove('glow-white'));
    solutionList.innerHTML = '';
    if (solutionList.classList.contains('is-expanded')) toggleExpandList(false);
}

function compactSetup() {
    const n = gameState.blocks.length;
    const start = gameState.blocks.map(b => Math.round(b.x / HOLE_SPACING));
    const effects = [];
    for (let i = 0; i < n; i++) {
        const row = [];
        for (let j = 0; j < n; j++) {
            const targetId = j + 1;
            const relation = gameState.blocks[i].group[targetId] || 0;
            row.push(relation);
        }
        effects.push(row);
    }
    return {n, start, effects};
}

function solveInWorker() {
    if (undefined === window.Worker) return Promise.reject(new Error("Web Workers are not supported."));
    const setup = compactSetup();
    const payload = {
        n: setup.n,
        start: setup.start,
        effects: setup.effects,
        mode: "fewer-switches-fast",
        timeoutMs: SOLVE_TIMEOUT_MS
    };
    return new Promise((resolve, reject) => {
        const worker = new Worker('solver.js');
        const hardTimeout = setTimeout(() => {
            worker.terminate();
            resolve({timeout: true});
        }, SOLVE_TIMEOUT_MS + 1000);
        worker.onmessage = (event) => {
            clearTimeout(hardTimeout);
            worker.terminate();
            if (event.data?.error) reject(new Error(event.data.error)); else resolve(event.data);
        };
        worker.onerror = (error) => {
            clearTimeout(hardTimeout);
            worker.terminate();
            reject(error);
        };
        worker.postMessage(payload);
    });
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function jumpToStep(targetIndex) {
    targetIndex = targetIndex - 1;
    if (null === currentSolution || isPlaying) return;
    while (currentStepIndex < targetIndex) {
        applySingleMove(currentSolution[currentStepIndex], false);
        currentStepIndex++;
    }
    while (currentStepIndex > targetIndex) {
        applySingleMove(currentSolution[currentStepIndex - 1], true);
        currentStepIndex--;
    }
    updatePlaybackUI();
}

function updatePlaybackUI() {
    if (null === currentSolution) return;
    prevBtn.disabled = (0 === currentStepIndex) || isPlaying;
    nextBtn.disabled = (currentStepIndex === currentSolution.length) || isPlaying;
    playBtn.disabled = (currentStepIndex === currentSolution.length);
    restartSeqBtn.disabled = isPlaying;
    solveBtn.disabled = isPlaying;
    Array.from(solutionList.children).forEach(el => el.classList.remove('active-step'));
    gameState.blocks.forEach(b => b.el.classList.remove('is-touched', 'selected', 'linked-highlight', 'linked-highlight-reverse'));
    if (currentStepIndex < currentSolution.length) {
        let activeDomIndex = moveMap[currentStepIndex];
        if (undefined !== activeDomIndex && solutionList.children[activeDomIndex]) {
            let activeEl = solutionList.children[activeDomIndex];
            activeEl.classList.add('active-step');
            if (0 === currentStepIndex) {
                solutionList.scrollTop = 0;
            } else activeEl.scrollIntoView({behavior: 'smooth', block: 'nearest'});
        }
        const nextMove = currentSolution[currentStepIndex];
        const activeBlock = gameState.blocks.find(b => b.id === nextMove.plate);
        let elementsToGlow = [];
        if (activeBlock) {
            if ('right' === nextMove.direction) {
                activeBlock.el.classList.add('linked-highlight');
            } else activeBlock.el.classList.add('linked-highlight-reverse');
            let moveCount = 0;
            if (nextMove.count) {
                moveCount = nextMove.count;
            } else for (let i = currentStepIndex; i < currentSolution.length; i++) if (currentSolution[i].plate === nextMove.plate && currentSolution[i].direction === nextMove.direction) {
                moveCount++;
            } else break;
            let currentHoleOffset = Math.round(activeBlock.x / HOLE_SPACING);
            let currentPinHole = 3 - currentHoleOffset;
            for (let step = moveCount; step <= moveCount; step++) {
                let targetHoleIndex = nextMove.direction === 'right' ? currentPinHole - step : currentPinHole + step;
                if (targetHoleIndex >= 0 && targetHoleIndex <= 6) {
                    let holes = activeBlock.el.querySelectorAll('.hole');
                    if (holes[targetHoleIndex]) elementsToGlow.push(holes[targetHoleIndex]);
                }
            }
        }
        document.querySelectorAll('.hole.glow-white').forEach(h => {
            if (!elementsToGlow.includes(h) && !h.glowTimeoutId) h.glowTimeoutId = setTimeout(() => {
                h.classList.remove('glow-white');
                h.glowTimeoutId = null;
            }, 250);
        });
        elementsToGlow.forEach(h => {
            if (h.glowTimeoutId) {
                clearTimeout(h.glowTimeoutId);
                h.glowTimeoutId = null;
            }
            if (!h.classList.contains('glow-white')) h.classList.add('glow-white');
        });
    } else if (0 < currentSolution.length) {
        document.querySelectorAll('.hole.glow-white').forEach(h => {
            if (!h.glowTimeoutId) h.glowTimeoutId = setTimeout(() => {
                h.classList.remove('glow-white');
                h.glowTimeoutId = null;
            }, 250);
        });
        let lastDomIndex = moveMap[currentSolution.length - 1];
        if (undefined !== lastDomIndex && solutionList.children[lastDomIndex]) {
            solutionList.children[lastDomIndex].classList.add('active-step');
            solutionList.children[lastDomIndex].scrollIntoView({behavior: 'smooth', block: 'nearest'});
        }
    }
}

function renderSolutionList() {
    if (null === currentSolution) return;
    solutionList.innerHTML = '';
    moveMap = [];
    let movesToRender = [];
    let domIndex = 0;
    if (squashMovesCheck.checked) {
        currentSolution.forEach((m, i) => {
            let last = movesToRender[movesToRender.length - 1];
            if (last && last.plate === m.plate && last.direction === m.direction) {
                last.count++;
                last.targetIndex = i + 1;
                moveMap[i] = domIndex - 1;
            } else {
                movesToRender.push({...m, count: 1, targetIndex: i + 1});
                moveMap[i] = domIndex;
                domIndex++;
            }
        });
    } else currentSolution.forEach((m, i) => {
        movesToRender.push({...m, count: 1, targetIndex: i + 1});
        moveMap[i] = i;
    });
    movesToRender.forEach((m, index) => {
        const step = document.createElement('div');
        const icon = 'left' === m.direction ? '←' : '→';
        let text = `${index + 1}. Block ${m.plate} ${icon} ${m.direction.toUpperCase()}`;
        if (1 < m.count) text += ` (x${m.count})`;
        step.textContent = text;
        step.style.cursor = 'pointer';
        step.addEventListener('click', () => jumpToStep(m.targetIndex));
        solutionList.appendChild(step);
    });
    updatePlaybackUI();
}

squashMovesCheck.addEventListener('change', renderSolutionList);

solveBtn.addEventListener('click', async () => {
    const setup = compactSetup();
    if (setup.start.every(v => v === 0)) {
        clearSolutionUI();
        return;
    }
    clearSolutionUI();
    solveBtn.textContent = "Solving...";
    solveBtn.disabled = true;
    setStatus("Calculating solution...", "info");
    try {
        const result = await solveInWorker();
        if (result.timeout) {
            setStatus("Solver timed out! Try adjusting parameters.", "error");
        } else if (!result || !result.moves) {
            setStatus("No solution found from this state.", "error");
        } else if (result.moves.length === 0) {
            setStatus("", "info");
        } else {
            currentSolution = result.moves;
            currentStepIndex = 0;
            setStatus(`Solution found: ${result.moves.length} moves!`, "success");
            playBtn.style.display = 'block';
            restartSeqBtn.style.display = 'block';
            stepControlsRow.classList.add('show-stretch');
            squashLabel.classList.add('show-stretch');
            renderSolutionList();
        }
    } catch (error) {
        setStatus("Solver crashed: " + error.message, "error");
    } finally {
        solveBtn.textContent = "Solve Lock";
        if (!isPlaying) solveBtn.disabled = false;
    }
});
playBtn.addEventListener('click', async () => {
    if (null === currentSolution || currentStepIndex >= currentSolution.length) return;
    if (isPlaying) {
        isPlaying = false;
        playBtn.textContent = '▶ Play';
        setStatus("Paused sequence.", "info");
        return;
    }
    isPlaying = true;
    playBtn.textContent = '⏸ Pause';
    setStatus("Playing sequence...", "info");
    updatePlaybackUI();
    while (currentStepIndex < currentSolution.length && isPlaying) {
        applySingleMove(currentSolution[currentStepIndex], false);
        currentStepIndex++;
        updatePlaybackUI();
        await sleep(300);
    }
    isPlaying = false;
    if (currentStepIndex >= currentSolution.length) {
        playBtn.textContent = '▶ Play';
        setStatus("Sequence complete!", "success");
    }
    updatePlaybackUI();
});

restartSeqBtn.addEventListener('click', () => {
    if (null === currentSolution || isPlaying) return;
    setStatus("Restarting sequence...", "info");
    while (currentStepIndex > 0) {
        applySingleMove(currentSolution[currentStepIndex - 1], true);
        currentStepIndex--;
    }
    playBtn.textContent = '▶ Play';
    setStatus(`Solution found: ${currentSolution.length} moves!`, "success");
    updatePlaybackUI();
});

function setInitialScale() {
    if (gameState.isMobile) {
        setInitialMobileScale()
    } else {
        const initialScale = 1.4;
        document.documentElement.style.setProperty('--block-scale', initialScale);
        sizeInput.value = initialScale;
    }
}

setInitialScale();


function vibrate(duration) {

    if(navigator.vibrate) navigator.vibrate(duration);

    if (!navigator.getGamepads) return;
    const gamepads = navigator.getGamepads();
    for (let gamepad of gamepads) if (gamepad && gamepad.vibrationActuator && typeof gamepad.vibrationActuator.playEffect === 'function') {
        gamepad.vibrationActuator.playEffect("dual-rumble", {
            startDelay: 0,
            //for gamepads its increesad
            duration: duration * 4,
            weakMagnitude: 1.0,
            strongMagnitude: 0.0
        }).catch(error => {});
        break;
    }
}

function updatePinState(pin, currentX) {

    const
        holeIndex = Math.round(currentX * ONE_OVER_HOLE_SPACING),
        distanceToHole = Math.abs(currentX - (holeIndex * HOLE_SPACING));

    if (distanceToHole >= 3) {
        if (pin.dataset.wasOverHole !== 'false') {
            pin.dataset.wasOverHole = 'false';
        }

        const targetTransform = `translateZ(${PIN_UNDER}px)`;
        if (pin.style.transform !== targetTransform) {
            pin.style.transform = targetTransform;
        }
        return;
    }

    const wasOverHole = pin.dataset.wasOverHole === 'true';

    if (!wasOverHole) {
        pin.dataset.wasOverHole = 'true';
        vibrate(15)
    }

    const targetTransform = `translateZ(${(holeIndex === 0) ? PIN_RAISED : PIN_MIDDLE}px)`;
    if (pin.style.transform !== targetTransform) {
        pin.style.transform = targetTransform;
    }
}

function updateHoverPreview(plate) {
    if (gameState.activeLinkerId || currentSolution) return;
    clearHoverPreview(true);
    if (!plate) return;
    const hoveredBlock = gameState.blocks.find(b => b.el === plate);
    if (!hoveredBlock) return;
    plate.classList.add('is-touched');
    gameState.isHovering = true;
    const groupIds = Object.keys(hoveredBlock.group);
    if (groupIds.length <= 1) return;
    groupIds.forEach(idStr => {
        const id = parseInt(idStr, 10);
        if (id === hoveredBlock.id) return;
        const member = gameState.blocks.find(b => b.id === id);
        if (!member) return;
        member.el.classList.add(1 === hoveredBlock.group[id] ? 'linked-highlight' : 'linked-highlight-reverse');
    });
}

function clearHoverPreview(isEndHovering) {
    if (gameState.activeLinkerId || currentSolution) return;
    if (gameState.lastAction === 'deselect') {
        gameState.lastAction === 'deselectDragEnd';
        return;
    }
    if (!gameState.isHovering && !isEndHovering) return;
    document.querySelectorAll('.linked-highlight, .linked-highlight-reverse, .is-touched').forEach(el => el.classList.remove('linked-highlight', 'linked-highlight-reverse', 'is-touched'));
    gameState.isHovering = false;
}

function createPlate(id, prevX, zPos) {

    const plate = document.createElement('div');
    plate.className = 'plate glow';
    plate.dataset.id = id;


    const renderPinBody = function () {
        let sidesHtml = '';
        for (let s = 0; s < 16; s++) sidesHtml += `<div class="pin-side" style="transform: rotateZ(${s * 22.5}deg) translateY(-6px) rotateX(90deg)"></div>`;
        return `<div class="pin-body">${sidesHtml}<div></div></div>`;
    }

    let holesHtml = '';
    for (let h = 0; h < 7; h++) {
        if (3 === h) {
            holesHtml += `<div class="hole pin-hole ` + h + ` "><div class="pin-wrapper" style="transform: translateX(${-prevX}px)"><div class="pin pin-visible pin-body-visible" style="transform: translateZ(${PIN_RAISED}px)">${renderPinBody()}<div class="pin-cap"></div></div></div></div>`;
        } else {
            holesHtml += `<div class="hole ` + h + `"></div>`;
        }
    }

    let tubeHtml = '';
    const corners = [
        {class: 'tube-tr', startAngle: 0},
        {class: 'tube-br', startAngle: 90},
        {class: 'tube-bl', startAngle: 180},
        {class: 'tube-tl', startAngle: 270}
    ];

    corners.forEach(corner => {
        let Ydeg = '-30px';
        if ('tube-tl' === corner.class || 'tube-bl' === corner.class) {
            Ydeg = '-29px';
        }
        if ('tube-tr' === corner.class || 'tube-br' === corner.class) {
            Ydeg = '-29.5px';
        }
        tubeHtml += `<div class="corner-tube ${corner.class}">`;
        for (let a = 7.5; a < 90; a += 15) {
            let totalAngle = corner.startAngle + a;
            tubeHtml += `<div class="tube-panel" style="transform: rotateZ(${totalAngle}deg) translateY(${Ydeg}) rotateX(-90deg)"></div>`;
        }
        tubeHtml += '</div>';
    });

    plate.innerHTML = ` <div class="front-face"></div> <div class="top-face">${holesHtml}</div> <div class="right-face"></div> <div class="bottom-face"></div> <div class="left-face"></div> ${tubeHtml} `;
    plate.style.transform = `translateZ(${zPos}px) translateX(${prevX}px)`;


    plate.addEventListener('mouseenter', () => {
        if (Date.now() - (gameState.lastTouchTime || 0) < 500) return;
        updateHoverPreview(plate);
    });
    plate.addEventListener('mouseleave', () => clearHoverPreview(true));
    plate.addEventListener('touchstart', () => clearHoverPreview(true), {passive: true});

    return plate;
}

function renderBlocks() {

    const
        count = parseInt(countInput.value),
        centerOffset = (count - 1) / 2,
        spacing = gameState.isMobile ? 55 : 50
    ;

    //todo does it need to be map here (id as a place in obj)
    const oldBlocks = new Map(gameState.blocks.map(b => [b.id, b]));

    lock.innerHTML = '';
    gameState.blocks = [];
    gameState.activeLinkerId = null;

    for (let i = 0; i < count; i++) {
        const id = i + 1;
        const zPos = (centerOffset - i) * spacing;

        let prevX = 0;
        let currentGroup = null;

        const oldBlock = oldBlocks.get(id);
        if (oldBlock) {
            prevX = oldBlock.x;
            const oldGroup = oldBlock.group;

            if (Object.keys(oldGroup).length > 1) {
                currentGroup = {};
                for (const key in oldGroup) {
                    const kid = Number(key);
                    if (kid <= count) {
                        currentGroup[kid] = oldGroup[key];
                    }
                }
            }
        }

        const plate = createPlate(id, prevX, zPos);
        lock.prepend(plate);

        gameState.blocks.push({
            id: id,
            x: prevX,
            z: zPos,
            el: plate,
            pinWrapper: plate.querySelector('.pin-wrapper'),
            pin: plate.querySelector('.pin'),
            group: currentGroup || { [id]: 1 }
        });

        if (plate.querySelector('.pin')) {
            updatePinState(plate.querySelector('.pin'), prevX)
        }
    }
    renderInspectorRow();
}

sizeInput.addEventListener('input', (e) => document.documentElement.style.setProperty('--block-scale', e.target.value));

//todo need event here or can manual call renderBlocks(),clearSolutionUI()
countInput.addEventListener('input', (e) => {
    renderBlocks()
    clearSolutionUI()
});
btnDecrease.addEventListener('click', () => {
    let currentValue = parseInt(countInput.value, 10);
    let min = parseInt(countInput.min, 10) || 1;
    if (currentValue > min) {
        countInput.value = currentValue - 1;
        countInput.dispatchEvent(new Event('input'));
    }
});
btnIncrease.addEventListener('click', () => {
    let currentValue = parseInt(countInput.value, 10);
    let max = parseInt(countInput.max, 10) || 20;
    if (currentValue < max) {
        countInput.value = currentValue + 1;
        countInput.dispatchEvent(new Event('input'));
    }
});
function toggleExpandList(forceState) {
    const isExpanded = undefined !== forceState ? forceState : solutionList.classList.toggle('is-expanded');
    if (undefined !== forceState) solutionList.classList.toggle('is-expanded', forceState);
    const parentRow = document.getElementById('stepControlsRow');
    if (parentRow) parentRow.classList.toggle('is-expanded-parent', isExpanded);
    expandBtn.textContent = isExpanded ? '▲ Collapse List ▲' : '▼ Expand Full List ▼';
    if (isExpanded) {
        const rect = solutionList.getBoundingClientRect();
        const bottomPadding = window.innerHeight * 0.05;
        const availableHeight = window.innerHeight - rect.top - bottomPadding - 45;
        solutionList.style.height = `${availableHeight}px`;
        solutionList.style.maxHeight = `${availableHeight}px`;
        setTimeout(() => {
            solutionList.style.scrollBehavior = 'auto';
            if (currentStepIndex === 0) {
                solutionList.scrollTop = 0;
            } else {
                const activeStep = solutionList.querySelector('.active-step');
                if (activeStep) activeStep.scrollIntoView({behavior: 'auto', block: 'nearest'});
            }
            setTimeout(() => solutionList.style.scrollBehavior = 'smooth', 50);
        }, 310);
    } else {
        solutionList.style.height = '';
        solutionList.style.maxHeight = '';
        setTimeout(() => {
            solutionList.style.scrollBehavior = 'auto';
            if (currentStepIndex === 0) {
                solutionList.scrollTop = 0;
            } else {
                const activeStep = solutionList.querySelector('.active-step');
                if (activeStep) activeStep.scrollIntoView({behavior: 'auto', block: 'nearest'});
            }
            setTimeout(() => solutionList.style.scrollBehavior = 'smooth', 50);
        }, 310);
    }
}

expandBtn.addEventListener('click', () => toggleExpandList());

squashMovesCheck.addEventListener('change', () => {
    renderSolutionList();
    if (solutionList.classList.contains('is-expanded')) toggleExpandList(true);
});
resetBtn.addEventListener('click', () => {
    clearSolutionUI();
    gameState.blocks = [];
    gameState.activeLinkerId = null;
    gameState.dragState.activePlate = null;
    gameState.dragState.movingGroup = [];
    gameState.dragState.isDragging = false;
    clearTimeout(gameState.dragState.longPressTimer);
    renderBlocks();
});
renderBlocks();
function getClientX(e) {
    return e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
}

function longPress(clickedId) {
    clearTimeout(gameState.dragState.longPressTimer);
    gameState.dragState.longPressTimer = setTimeout(() => {
        if (!gameState.dragState.isDragging && gameState.dragState.activePlate) {
            let curBlock = gameState.blocks.find(b => b.id === clickedId);
            if (!curBlock) return;
            if (null === gameState.activeLinkerId) {
                gameState.activeLinkerId = curBlock.id;
                gameState.dragState.activePlate.classList.add('selected');
                Object.keys(curBlock.group).forEach(idStr => {
                    let id = parseInt(idStr);
                    if (id !== curBlock.id) {
                        let b = gameState.blocks.find(x => x.id === id);
                        if (b) if (1 === curBlock.group[id]) b.el.classList.add('linked-highlight'); else b.el.classList.add('linked-highlight-reverse');
                    }
                });
                vibrate(15)
            } else if (gameState.activeLinkerId === curBlock.id) {
                gameState.activeLinkerId = null;
                gameState.dragState.activePlate.classList.remove('selected');
                gameState.lastAction = 'deselect';
                updateHoverPreview(gameState.dragState.activePlate);
                vibrate(15)
                renderInspectorRow();
            } else {
                let masterBlock = gameState.blocks.find(b => b.id === gameState.activeLinkerId);
                if (masterBlock.group[curBlock.id]) {
                    if (1 === masterBlock.group[curBlock.id]) {
                        masterBlock.group[curBlock.id] = -1;
                        gameState.dragState.activePlate.classList.remove('linked-highlight');
                        gameState.dragState.activePlate.classList.add('linked-highlight-reverse');
                    } else if (-1 === masterBlock.group[curBlock.id]) {
                        delete masterBlock.group[curBlock.id];
                        gameState.dragState.activePlate.classList.remove('linked-highlight-reverse');
                    }
                } else {
                    masterBlock.group[curBlock.id] = 1;
                    gameState.dragState.activePlate.classList.add('linked-highlight');
                }
                vibrate(15)
            }
        }
    }, gameState.activeLinkerId ? SHORT_PRESS_DURATION : LONG_PRESS_DURATION);
}

function applySingleMove(move, reverse = false) {
    const primaryBlock = gameState.blocks[move.plate - 1];
    let stepShift = ("left" === move.direction) ? -HOLE_SPACING : HOLE_SPACING;
    if (true === reverse) stepShift *= -1;
    let draggedBlockPolarity = primaryBlock.group[primaryBlock.id] || 1;
    Object.keys(primaryBlock.group).forEach(idStr => {
        const id = parseInt(idStr);
        const relativeDir = (primaryBlock.group[id] * draggedBlockPolarity);
        const b = gameState.blocks.find(x => x.id === id);
        if (b) {
            let newX = b.x + (stepShift * relativeDir);
            const maxBound = 3 * HOLE_SPACING;
            if (newX > maxBound) newX = maxBound;
            if (newX < -maxBound) newX = -maxBound;
            b.x = newX;
            b.el.style.transition = 'transform 0.2s ease-out';
            b.el.style.transform = `translateZ(${b.z}px) translateX(${newX}px)`;
            if (b.pinWrapper && b.pin) {
                b.pinWrapper.style.transition = 'transform 0.2s ease-out';
                b.pinWrapper.style.transform = `translateX(${-newX}px)`;
                b.pin.style.transition = 'transform 0.05s ease-in';
                b.pin.style.transform = `translateZ(${PIN_UNDER}px)`;
                setTimeout(() => {
                    b.pin.style.transition = 'transform 0.1s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                    updatePinState(b.pin, newX);
                }, 200);
            }
        }
    });
}

function handleDragStart(e) {
    if (e.touches) gameState.lastTouchTime = Date.now();
    if (e.touches && 2 <= e.touches.length) {
        document.body.classList.add('is-zooming');
        pinchState.initialDistance = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        pinchState.initialScale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--block-scale')) || 1;
        clearTimeout(gameState.dragState.longPressTimer);
        if (gameState.dragState.activePlate) {
            gameState.dragState.movingGroup.forEach(item => {
                item.block.x = item.initialX;
                item.block.el.style.transform = `translateZ(${item.block.z}px) translateX(${item.initialX}px)`;
                if (item.block.pinWrapper && item.block.pin) {
                    item.block.pinWrapper.style.transform = `translateX(${-item.initialX}px)`;
                    updatePinState(item.block.pin, item.initialX);
                }
            });
            clearHoverPreview(true);
            gameState.dragState.activePlate = null;
            gameState.dragState.movingGroup = [];
            gameState.dragState.isDragging = false;
        }
        return;
    }
    const clickedPlate = e.target.closest('.plate');
    if (!clickedPlate) return;
    gameState.dragState.hasMoved = false;
    if (e.type === 'mousedown') e.preventDefault();
    if (currentSolution) clearSolutionUI();
    gameState.dragState.activePlate = clickedPlate;
    gameState.dragState.startInputX = getClientX(e);
    gameState.dragState.isDragging = false;
    gameState.dragState.movingGroup = [];
    updateHoverPreview(gameState.dragState.activePlate);
    const clickedId = parseInt(clickedPlate.dataset.id);
    let clickedBlock = gameState.blocks.find(b => b.id === clickedId);
    if (!clickedBlock) return;
    //let draggedBlockPolarity = clickedBlock.group[clickedBlock.id] || 1;
    Object.keys(clickedBlock.group).forEach(idStr => {
        let id = parseInt(idStr),
            dir = clickedBlock.group[id],
            //direction depending of main one block (usually number (1) * child dir)
            //relativeDir = draggedBlockPolarity * rawDir,
            b = gameState.blocks.find(x => x.id === id);
        if (b) {
            gameState.dragState.movingGroup.push({block: b, dir: dir, initialX: b.x});
            b.el.style.transition = 'none';
            if (b.pinWrapper) b.pinWrapper.style.transition = 'none';
        }
    });
    gameState.lastAction = 'handleDragStart';
    longPress(clickedId);
}

function handleDragMove(e) {
    if (e.touches && 2 === e.touches.length) {
        e.preventDefault();
        if (!pinchState.initialDistance) {
            pinchState.initialDistance = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            pinchState.initialScale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--block-scale')) || 1;
        }
        const currentDistance = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        let newScale = pinchState.initialScale * (currentDistance / pinchState.initialDistance);
        if (newScale < 0.3) newScale = 0.3;
        if (newScale > 2) newScale = 2;
        document.documentElement.style.setProperty('--block-scale', newScale);
        sizeInput.value = newScale;
        return;
    }
    if (!gameState.dragState.activePlate || 0 === gameState.dragState.movingGroup.length || gameState.activeLinkerId) return;
    gameState.dragState.hasMoved = true;
    let clientX = getClientX(e);
    if (Math.abs(clientX - gameState.dragState.startInputX) > DRAG_THRESHOLD) {
        gameState.dragState.isDragging = true;
        clearTimeout(gameState.dragState.longPressTimer);
    }
    let scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--block-scale')) || 1,
        rawDeltaX = (clientX - gameState.dragState.startInputX) / scale,
        minDeltaX = -Infinity,
        maxDeltaX = Infinity;
    gameState.dragState.movingGroup.forEach(item => {
        let limitLeft = 1 === item.dir ? -120 - item.initialX : item.initialX - 120;
        let limitRight = 1 === item.dir ? 120 - item.initialX : item.initialX + 120;
        if (limitLeft > minDeltaX) minDeltaX = limitLeft;
        if (limitRight < maxDeltaX) maxDeltaX = limitRight;
    });
    let deltaX = rawDeltaX;
    if (deltaX < minDeltaX) deltaX = minDeltaX;
    if (deltaX > maxDeltaX) deltaX = maxDeltaX;
    gameState.dragState.movingGroup.forEach(item => {
        let newX = item.initialX + (deltaX * item.dir);
        item.currentX = newX;
        item.block.el.style.transform = `translateZ(${item.block.z}px) translateX(${newX}px)`;
        if (item.block.pinWrapper && item.block.pin) {
            item.block.pinWrapper.style.transform = `translateX(${-newX}px)`;
            updatePinState(item.block.pin, newX);
        }
    });
    gameState.lastAction = 'handleDragMove';
}

function handleDragEnd(e) {
    if (e && e.changedTouches) gameState.lastTouchTime = Date.now();
    if (!e || !e.touches || e.touches.length < 2) document.body.classList.remove('is-zooming');
    pinchState.initialDistance = 0;
    clearTimeout(gameState.dragState.longPressTimer);
    if (gameState.dragState.activePlate) clearHoverPreview();
    if (gameState.dragState.activePlate && 0 < gameState.dragState.movingGroup.length && true === gameState.dragState.isDragging) {
        const clickedId = parseInt(gameState.dragState.activePlate.dataset.id);
        let primary = gameState.dragState.movingGroup.find(item => item.block.id === clickedId) || gameState.dragState.movingGroup[0];
        let currentX = undefined !== primary.currentX ? primary.currentX : primary.initialX;
        let holeIndex = Math.round(currentX / HOLE_SPACING);
        let snappedX = holeIndex * HOLE_SPACING;
        let snapDelta = snappedX - currentX;
        let maxAllowedShiftRight = Infinity;
        let maxAllowedShiftLeft = -Infinity;
        gameState.dragState.movingGroup.forEach(item => {
            let cx = undefined !== item.currentX ? item.currentX : item.initialX;
            let limitLeft = 1 === item.dir ? -120 - cx : cx - 120;
            let limitRight = 1 === item.dir ? 120 - cx : cx + 120;
            if (limitLeft > maxAllowedShiftLeft) maxAllowedShiftLeft = limitLeft;
            if (limitRight < maxAllowedShiftRight) maxAllowedShiftRight = limitRight;
        });
        if (snapDelta < maxAllowedShiftLeft) snapDelta = maxAllowedShiftLeft;
        if (snapDelta > maxAllowedShiftRight) snapDelta = maxAllowedShiftRight;
        gameState.dragState.movingGroup.forEach(item => {
            let cx = undefined !== item.currentX ? item.currentX : item.initialX;
            let finalX = cx + (snapDelta * item.dir);
            item.block.x = finalX;
            item.block.el.style.transition = 'transform 0.2s ease-out';
            item.block.el.style.transform = `translateZ(${item.block.z}px) translateX(${finalX}px)`;
            if (item.block.pinWrapper && item.block.pin) {
                item.block.pinWrapper.style.transition = 'transform 0.2s ease-out';
                item.block.pinWrapper.style.transform = `translateX(${-finalX}px)`;
                updatePinState(item.block.pin, finalX);
            }
        });
    }
    gameState.dragState.activePlate = null;
    gameState.dragState.movingGroup = [];
    gameState.dragState.isDragging = false;
    gameState.lastAction = gameState.lastAction === 'deselectDragEnd' ? gameState.lastAction : 'handleDragEnd';
    if (e && 'mouseup' === e.type) {
        if ((Date.now() - (gameState.lastTouchTime || 0) < 500) || gameState.lastAction === 'deselectDragEnd') return;
        const elementUnderCursor = document.elementFromPoint(e.clientX, e.clientY);
        const plateUnderCursor = elementUnderCursor ? elementUnderCursor.closest('.plate') : null;
        if (plateUnderCursor) updateHoverPreview(plateUnderCursor);
    }
}

function getNextSquashedIndex() {
    if (null === currentSolution || currentStepIndex >= currentSolution.length) return currentStepIndex;
    const currentMove = currentSolution[currentStepIndex];
    let nextIdx = currentStepIndex + 1;
    while (nextIdx < currentSolution.length) {
        const move = currentSolution[nextIdx];
        if (move.plate === currentMove.plate && move.direction === currentMove.direction) {
            nextIdx++;
        } else break;
    }
    return nextIdx + 1;
}

function getPrevSquashedIndex() {
    if (null === currentSolution || currentStepIndex <= 0) return currentStepIndex;
    const currentMove = currentSolution[currentStepIndex - 1];
    let prevIdx = currentStepIndex - 1;
    while (prevIdx > 0) {
        const move = currentSolution[prevIdx - 1];
        if (move.plate === currentMove.plate && move.direction === currentMove.direction) {
            prevIdx--;
        } else break;
    }
    return prevIdx + 1;
}

function stepForward(forceSquash = false) {
    if (null === currentSolution || isPlaying || currentStepIndex >= currentSolution.length) return;
    if (squashMovesCheck.checked || forceSquash) {
        const targetIdx = getNextSquashedIndex();
        jumpToStep(targetIdx);
    } else {
        applySingleMove(currentSolution[currentStepIndex], false);
        currentStepIndex++;
        updatePlaybackUI();
    }
}

function stepBackward(forceSquash = false) {
    if (null === currentSolution || isPlaying || currentStepIndex <= 0) return;
    if (squashMovesCheck.checked || forceSquash) {
        const targetIdx = getPrevSquashedIndex();
        jumpToStep(targetIdx);
    } else {
        currentStepIndex--;
        applySingleMove(currentSolution[currentStepIndex], true);
        updatePlaybackUI();
    }
}

function setupLongPress(button, stepFunction) {
    let pressTimer;
    let animTimer;
    let isLongPressExecuted = false;

    const startPress = (e) => {
        // Prevent any touch interaction if the button is disabled
        if (button.disabled) return;

        if (!gameState.isMobile) return;
        if (null === currentSolution || isPlaying) return;

        isLongPressExecuted = false;

        animTimer = setTimeout(() => button.classList.add('is-pressing'), 150);

        pressTimer = setTimeout(() => {
            button.classList.remove('is-pressing');
            isLongPressExecuted = true;
            stepFunction(true);
            if (navigator.vibrate) navigator.vibrate(50);
        }, 600);
    };

    const clearPress = () => {
        clearTimeout(animTimer);
        clearTimeout(pressTimer);
        button.classList.remove('is-pressing');
    };

    button.addEventListener('touchstart', startPress, {passive: true});
    button.addEventListener('touchend', clearPress);
    button.addEventListener('touchcancel', clearPress);
    button.addEventListener('click', (e) => {
        if (button.disabled) return;
        if (isLongPressExecuted) {
            e.preventDefault();
            return;
        }
        stepFunction(false);
    });
}

function renderInspectorRow() {
    if (!inspectorRow || !gameState.isMobile) return;
    inspectorRow.innerHTML = '';
    let assignedColors = {};
    let colorIndex = 0;
    gameState.blocks.forEach(block => {
        const groupIds = Object.keys(block.group).sort();
        if (groupIds.length > 1) {
            const groupSignature = groupIds.join('-');
            if (!assignedColors[groupSignature]) {
                assignedColors[groupSignature] = '#66d437';
                colorIndex++;
            }
        }
    });
    for (let i = 0; i < MAX_PLATES; i++) {
        const btn = document.createElement('button');
        btn.className = 'inspect-btn';
        btn.textContent = i + 1;
        if (i < gameState.blocks.length) {
            const block = gameState.blocks[i];
            const groupIds = Object.keys(block.group).sort();
            let defaultBg = '';
            if (groupIds.length > 1) {
                const groupSignature = groupIds.join('-');
                const gColor = assignedColors[groupSignature];
                btn.style.borderColor = gColor;
                btn.style.color = gColor;
                defaultBg = `${gColor}22`;
            }
            btn.blockEl = block.el;
            btn.dataset.defaultBg = defaultBg;
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (window.currentHoveredBtn && window.currentHoveredBtn !== btn) {
                    window.currentHoveredBtn.style.background = window.currentHoveredBtn.dataset.defaultBg || '';
                }
                window.currentHoveredBtn = btn;
                updateHoverPreview(block.el);
                btn.style.background = '#555';
            }, {passive: false});
        } else {
            btn.classList.add('disabled-btn');
            btn.addEventListener('touchstart', (e) => e.preventDefault(), {passive: false});
        }
        inspectorRow.appendChild(btn);
    }
}

window.currentHoveredBtn = null;
inspectorRow.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    if (target && target.classList.contains('inspect-btn') && !target.classList.contains('disabled-btn')) {
        if (window.currentHoveredBtn !== target) {
            if (window.currentHoveredBtn) {
                clearHoverPreview(true);
                window.currentHoveredBtn.style.background = window.currentHoveredBtn.dataset.defaultBg || '';
            }
            window.currentHoveredBtn = target;
            updateHoverPreview(target.blockEl);
            target.style.background = '#555';
        }
    } else {
        if (window.currentHoveredBtn) {
            clearHoverPreview(true);
            window.currentHoveredBtn.style.background = window.currentHoveredBtn.dataset.defaultBg || '';
            window.currentHoveredBtn = null;
        }
    }
}, {passive: false});
const releaseSlidingTouch = () => {
    if (window.currentHoveredBtn) {
        clearHoverPreview(true);
        window.currentHoveredBtn.style.background = window.currentHoveredBtn.dataset.defaultBg || '';
        window.currentHoveredBtn = null;
    }
};
inspectorRow.addEventListener('touchend', releaseSlidingTouch);
inspectorRow.addEventListener('touchcancel', releaseSlidingTouch);

setupLongPress(nextBtn, stepForward);
setupLongPress(prevBtn, stepBackward);
document.addEventListener('mousedown', handleDragStart);
document.addEventListener('mousemove', handleDragMove);
window.addEventListener('mouseup', handleDragEnd);
document.addEventListener('touchstart', handleDragStart, {passive: false});
document.addEventListener('touchmove', handleDragMove, {passive: false});
window.addEventListener('touchend', handleDragEnd);
document.addEventListener('touchcancel', handleDragEnd);

const tutorialOverlay = document.getElementById('tutorialOverlay'),
    tutorialBubble = document.getElementById('tutorialBubble'),
    tutorialText = document.getElementById('tutorialText'),
    tutorialArrow = document.getElementById('tutorialArrow'),
    questionMarkBtn = document.querySelector('.question-mark'),
    iconQm = document.getElementById('icon-qm'),
    iconX = document.getElementById('icon-x'),
    guidePrev = document.getElementById('guidePrev'),
    guideNext = document.getElementById('guideNext'),
    footer = document.getElementById('footer');

let tutorialStep = 0;
let currentTutorialVersion = 0;
let isGuideActive = false;

questionMarkBtn.addEventListener('click', () => {
    if (isGuideActive) {
        endTutorial();
    } else {
        startTutorial();
    }
});

guidePrev.addEventListener('click', () => {
    if (tutorialStep > 1) {
        tutorialStep--;
        currentTutorialVersion++;
        runTutorialStep(currentTutorialVersion);
    }
});

guideNext.addEventListener('click', () => {
    tutorialStep++;
    currentTutorialVersion++;
    runTutorialStep(currentTutorialVersion);
});

function positionArrowRelative(target, offsetX = 0, offsetY = 0) {
    if (!target) return;
    const rect = target.getBoundingClientRect();
    tutorialArrow.style.top = `${rect.top + offsetY}px`;
    tutorialArrow.style.left = `${rect.left + offsetX}px`;
    tutorialArrow.style.display = 'block';
}

function setInitialMobileScale() {
    if (window.innerWidth <= 768) {
        // The plate mechanism is ~340px wide. We scale it down to fit the device width.
        // We subtract 140px to account for some padding/margins.
        let startScale = (window.innerWidth - 140) / 340;

        startScale = Math.max(0.3, Math.min(startScale, 1));
        document.documentElement.style.setProperty('--block-scale', startScale);

        const sizeInput = document.getElementById('sizeInput');
        if (sizeInput) {
            sizeInput.value = startScale;
        }
        if (typeof pinchState !== 'undefined') {
            pinchState.initialScale = startScale;
        }
    }
}

function startTutorial() {
    isGuideActive = true;
    resetBtn.click();
    tutorialOverlay.style.display = 'block';
    tutorialBubble.style.display = 'block';
    guidePrev.style.display = 'flex';
    guideNext.style.display = 'flex';
    iconQm.style.display = 'none';
    iconX.style.display = 'block';
    tutorialStep = 1;
    currentTutorialVersion++;
    runTutorialStep(currentTutorialVersion);
    footer.style.zIndex = '1001';
    if (gameState.isMobile) {
        //todo aniamation for this upper
        controls.style.top = '55%';
    }
}

function endTutorial() {
    isGuideActive = false;
    currentTutorialVersion++;
    tutorialOverlay.style.display = 'none';
    tutorialBubble.style.display = 'none';
    tutorialArrow.style.display = 'none';
    guidePrev.style.display = 'none';
    guideNext.style.display = 'none';
    iconQm.style.display = 'block';
    iconX.style.display = 'none';
    resetBtn.click();
    footer.style.zIndex = '1';
    if (gameState.isMobile) {
        controls.style = null;
    }
}

async function runTutorialStep(version) {
    tutorialArrow.style.display = 'none';
    gameState.blocks.forEach(b => {
        b.el.querySelector('.front-face').style.borderColor = '';
        b.el.classList.remove('selected', 'linked-highlight', 'linked-highlight-reverse', 'is-touched');
        b.el.style.transform = `translateZ(${b.z}px) translateX(${b.x}px)`;
    });

    if (6 !== parseInt(countInput.value) && 3 !== tutorialStep) {
        countInput.value = 6;
        renderBlocks();
    }

    if (1 === tutorialStep) {
        tutorialText.textContent = gameState.isMobile
            ? "Use a two-finger pinch gesture on the screen to zoom in or out."
            : "Use the slider to adjust zooming.";

        const baseScale = sizeInput ? parseFloat(sizeInput.value) : 1;

        while (version === currentTutorialVersion) {
            for (let i = 0; i <= 20; i++) {
                if (version !== currentTutorialVersion) break;
                let currentScale = baseScale + (i / 20) * 0.2;
                document.documentElement.style.setProperty('--block-scale', currentScale.toFixed(2));
                if (sizeInput) sizeInput.value = currentScale;
                await sleep(40);
            }

            await sleep(500);
            if (version !== currentTutorialVersion) break;
            for (let i = 0; i <= 20; i++) {
                if (version !== currentTutorialVersion) break;
                let currentScale = (baseScale + 0.2) - (i / 20) * 0.2;
                document.documentElement.style.setProperty('--block-scale', currentScale.toFixed(2));
                if (sizeInput) sizeInput.value = currentScale;
                await sleep(40);
            }

            await sleep(1000);
        }

        document.documentElement.style.setProperty('--block-scale', baseScale);
        if (sizeInput) sizeInput.value = baseScale;

    } else if (2 === tutorialStep) {
        tutorialText.textContent = "You can drag selected plates left or right.";
        let plateIndex = 0;
        while (version === currentTutorialVersion) {
            gameState.blocks.forEach(b => b.el.querySelector('.front-face').style.borderColor = '');
            if (gameState.blocks.length > 0) {
                const plate = gameState.blocks[plateIndex % gameState.blocks.length].el;
                plate.querySelector('.front-face').style.borderColor = 'white';
                plateIndex++;
            }
            await sleep(600);
        }
    } else if (3 === tutorialStep) {
        tutorialText.textContent = "Adjust plates like in a game: plates count and plates position.";
        while (version === currentTutorialVersion) {
            if (6 !== parseInt(countInput.value)) {
                countInput.value = 6;
                renderBlocks();
            }
            await sleep(500);
            if (version !== currentTutorialVersion) break;
            positionArrowRelative(btnIncrease, 15, -40);
            await sleep(600);
            if (version !== currentTutorialVersion) break;
            for (let i = 0; i < 2; i++) {
                btnIncrease.click();
                await sleep(600);
                if (version !== currentTutorialVersion) break;
            }
            if (version !== currentTutorialVersion) break;
            positionArrowRelative(btnDecrease, 15, -40);
            await sleep(600);
            if (version !== currentTutorialVersion) break;
            for (let i = 0; i < 2; i++) {
                btnDecrease.click();
                await sleep(600);
                if (version !== currentTutorialVersion) break;
            }
            if (version !== currentTutorialVersion) break;
            tutorialArrow.style.display = 'none';
            await sleep(400);

            const presets = [[-HOLE_SPACING, HOLE_SPACING, -HOLE_SPACING * 2, 0, HOLE_SPACING * 2, 0], [HOLE_SPACING * 2, -HOLE_SPACING, 0, HOLE_SPACING, -HOLE_SPACING * 2, HOLE_SPACING], [0, 0, HOLE_SPACING * 3, -HOLE_SPACING * 3, HOLE_SPACING, -HOLE_SPACING]];
            let pIndex = 0;
            while (pIndex < 3) {
                const positions = presets[pIndex % presets.length];
                gameState.blocks.forEach((b, i) => {
                    const targetX = positions[i] || 0;
                    b.x = targetX;
                    b.el.style.transition = 'transform 0.5s ease';
                    b.el.style.transform = `translateZ(${b.z}px) translateX(${targetX}px)`;
                    if (b.pinWrapper && b.pin) {
                        b.pinWrapper.style.transition = 'transform 0.5s ease';
                        b.pinWrapper.style.transform = `translateX(${-targetX}px)`;
                        b.pin.style.transition = 'transform 0.1s ease-in';
                        b.pin.style.transform = `translateZ(${PIN_UNDER}px)`;
                        setTimeout(() => {
                            b.pin.style.transition = 'transform 0.1s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                            updatePinState(b.pin, targetX);
                        }, 400);
                    }
                });
                pIndex++;
                await sleep(1500);
            }
            gameState.blocks.forEach(b => {
                b.x = 0;
                b.el.style.transition = 'transform 0.5s ease';
                b.el.style.transform = `translateZ(${b.z}px) translateX(0px)`;
                if (b.pinWrapper && b.pin) {
                    b.pinWrapper.style.transition = 'transform 0.5s ease';
                    b.pinWrapper.style.transform = `translateX(0px)`;
                    b.pin.style.transition = 'transform 0.1s ease-in';
                    b.pin.style.transform = `translateZ(${PIN_UNDER}px)`;
                    setTimeout(() => {
                        b.pin.style.transition = 'transform 0.1s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                        updatePinState(b.pin, 0);
                    }, 400);
                }
            });
            await sleep(1000);
        }
    } else if (4 === tutorialStep) {
        if (6 !== parseInt(countInput.value)) {
            countInput.value = 6;
            renderBlocks();
        }
        tutorialText.textContent = "Long-press to group plates. Blue moves with it, Red opposite. Tap again to deselect.";
        while (version === currentTutorialVersion) {
            gameState.blocks.forEach(b => {
                b.el.classList.remove('selected', 'linked-highlight', 'linked-highlight-reverse');
                b.el.querySelector('.front-face').style.borderColor = '';
                b.x = 0;
                b.el.style.transition = 'transform 0.5s ease';
                b.el.style.transform = `translateZ(${b.z}px) translateX(0px)`;
                if (b.pinWrapper && b.pin) {
                    b.pinWrapper.style.transition = 'transform 0.5s ease';
                    b.pinWrapper.style.transform = `translateX(0px)`;
                    updatePinState(b.pin, 0);
                }
            });
            await sleep(1000);
            if (version !== currentTutorialVersion) break;
            if (gameState.blocks.length >= 3) {
                const p1 = gameState.blocks[0];
                const p2 = gameState.blocks[1];
                const p3 = gameState.blocks[2];
                p1.el.classList.add('selected');
                await sleep(800);
                if (version !== currentTutorialVersion) break;
                positionArrowRelative(p2.el, 10, -50);
                await sleep(600);
                p2.el.classList.add('linked-highlight');
                await sleep(800);
                if (version !== currentTutorialVersion) break;
                positionArrowRelative(p3.el, 10, -50);
                await sleep(600);
                p3.el.classList.add('linked-highlight-reverse');
                await sleep(800);
                if (version !== currentTutorialVersion) break;
                tutorialArrow.style.display = 'none';
                let offset = 0;
                let direction = 1;
                for (let i = 0; i < 20; i++) {
                    if (version !== currentTutorialVersion) break;
                    offset += direction * 20;
                    if (offset > 50 || offset < -50) direction *= -1;
                    [{b: p1, dir: 1}, {b: p2, dir: 1}, {b: p3, dir: -1}].forEach(item => {
                        let currentX = offset * item.dir;
                        item.b.el.style.transition = 'transform 0.15s linear';
                        item.b.el.style.transform = `translateZ(${item.b.z}px) translateX(${currentX}px)`;
                        if (item.b.pinWrapper && item.b.pin) {
                            item.b.pinWrapper.style.transition = 'transform 0.15s linear';
                            item.b.pinWrapper.style.transform = `translateX(${-currentX}px)`;
                            item.b.pin.style.transition = 'transform 0.1s linear';
                            updatePinState(item.b.pin, currentX);
                        }
                    });
                    await sleep(150);
                }
                await sleep(800);
            } else await sleep(1000);
        }
    } else if (5 === tutorialStep) {
        tutorialText.textContent = gameState.isMobile ? "Touch the number row to see what groups are selected for plate" : "Hover with mouse to understand what are selected for plate";
        if (6 !== parseInt(countInput.value)) {
            countInput.value = 6;
            renderBlocks();
        }
        while (version === currentTutorialVersion) {
            gameState.blocks.forEach(b => b.el.classList.remove('selected', 'linked-highlight', 'linked-highlight-reverse', 'is-touched'));
            await sleep(500);
            if (version !== currentTutorialVersion) break;
            if (gameState.blocks.length >= 3) {
                const p1 = gameState.blocks[0];
                const p2 = gameState.blocks[1];
                const p3 = gameState.blocks[2];
                if (gameState.isMobile) {
                    const btn1 = inspectorRow.children[0];
                    if (btn1) positionArrowRelative(btn1, 10, -40);
                } else positionArrowRelative(p1.el, 10, -50);
                await sleep(800);
                if (version !== currentTutorialVersion) break;
                if (gameState.isMobile) {
                    const btn1 = inspectorRow.children[0];
                    if (btn1) btn1.style.background = '#555';
                }
                p1.el.classList.add('is-touched');
                p2.el.classList.add('linked-highlight');
                p3.el.classList.add('linked-highlight-reverse');
                await sleep(2000);
                if (version !== currentTutorialVersion) break;
                if (gameState.isMobile) {
                    const btn1 = inspectorRow.children[0];
                    if (btn1) btn1.style.background = btn1.dataset.defaultBg || '';
                }
                p1.el.classList.remove('is-touched');
                p2.el.classList.remove('linked-highlight');
                p3.el.classList.remove('linked-highlight-reverse');
                tutorialArrow.style.display = 'none';
                await sleep(1000);
            } else await sleep(1000);
        }
    } else if (6 === tutorialStep) {
        tutorialText.textContent = gameState.isMobile ? "You can walk step-by-step by pressing step controls. If you hold it, it will move plates state-by-state." : "If squashed is checked, plates will go from state-to-state. Without squashed, you can walk single steps.";
        resetBtn.click();
        await sleep(200);
        if (version !== currentTutorialVersion) return;
        const hardState = [HOLE_SPACING * 2, -HOLE_SPACING, HOLE_SPACING * 3, -HOLE_SPACING * 2, HOLE_SPACING, -HOLE_SPACING];
        gameState.blocks.forEach((b, i) => {
            const targetX = hardState[i] || 0;
            b.x = targetX;
            b.el.style.transition = 'transform 0.5s ease';
            b.el.style.transform = `translateZ(${b.z}px) translateX(${targetX}px)`;
            if (b.pinWrapper && b.pin) {
                b.pinWrapper.style.transition = 'transform 0.5s ease';
                b.pinWrapper.style.transform = `translateX(${-targetX}px)`;
                updatePinState(b.pin, targetX);
            }
        });
        await sleep(600);
        if (version !== currentTutorialVersion) return;
        solveBtn.click();
        while (solveBtn.disabled && version === currentTutorialVersion) await sleep(200);
        if (version !== currentTutorialVersion) return;
        while (version === currentTutorialVersion) {
            if (gameState.isMobile) {
                positionArrowRelative(nextBtn, 15, -40);
                await sleep(600);
                if (version !== currentTutorialVersion) break;
                for (let i = 0; i < 2; i++) {
                    if (version !== currentTutorialVersion) break;
                    nextBtn.click();
                    await sleep(600);
                }
                if (version !== currentTutorialVersion) break;
                nextBtn.style.transform = 'scale(0.9)';
                nextBtn.style.filter = 'brightness(0.7)';
                nextBtn.dispatchEvent(new Event('pointerdown'));
                nextBtn.dispatchEvent(new Event('mousedown'));
                nextBtn.dispatchEvent(new Event('touchstart'));
                await sleep(1500);
                nextBtn.dispatchEvent(new Event('pointerup'));
                nextBtn.dispatchEvent(new Event('mouseup'));
                nextBtn.dispatchEvent(new Event('touchend'));
                nextBtn.style.transform = '';
                nextBtn.style.filter = '';
                await sleep(800);
                if (version !== currentTutorialVersion) break;
                positionArrowRelative(prevBtn, 15, -40);
                await sleep(600);
                if (version !== currentTutorialVersion) break;
                for (let i = 0; i < 2; i++) {
                    if (version !== currentTutorialVersion) break;
                    prevBtn.click();
                    await sleep(600);
                }
                if (version !== currentTutorialVersion) break;
                prevBtn.style.transform = 'scale(0.9)';
                prevBtn.style.filter = 'brightness(0.7)';
                prevBtn.dispatchEvent(new Event('pointerdown'));
                prevBtn.dispatchEvent(new Event('mousedown'));
                prevBtn.dispatchEvent(new Event('touchstart'));
                await sleep(1500);
                prevBtn.dispatchEvent(new Event('pointerup'));
                prevBtn.dispatchEvent(new Event('mouseup'));
                prevBtn.dispatchEvent(new Event('touchend'));
                prevBtn.style.transform = '';
                prevBtn.style.filter = '';
                await sleep(800);
            } else {
                positionArrowRelative(nextBtn, 15, -40);
                await sleep(600);
                if (version !== currentTutorialVersion) break;
                for (let i = 0; i < 3; i++) {
                    if (version !== currentTutorialVersion) break;
                    nextBtn.click();
                    await sleep(800);
                }
                if (version !== currentTutorialVersion) break;
                positionArrowRelative(prevBtn, 15, -40);
                await sleep(600);
                if (version !== currentTutorialVersion) break;
                for (let i = 0; i < 3; i++) {
                    if (version !== currentTutorialVersion) break;
                    prevBtn.click();
                    await sleep(800);
                }
            }
        }
    } else if (7 === tutorialStep) {
        tutorialText.textContent = "You can play the whole sequence automatically. Press the play button.";
        while (version === currentTutorialVersion) {
            resetBtn.click();
            await sleep(400);
            if (version !== currentTutorialVersion) break;
            const playState = [-HOLE_SPACING * 2, HOLE_SPACING * 2, -HOLE_SPACING, HOLE_SPACING, 0, -HOLE_SPACING];
            gameState.blocks.forEach((b, i) => {
                const targetX = playState[i] || 0;
                b.x = targetX;
                b.el.style.transition = 'transform 0.5s ease';
                b.el.style.transform = `translateZ(${b.z}px) translateX(${targetX}px)`;
                if (b.pinWrapper && b.pin) {
                    b.pinWrapper.style.transition = 'transform 0.5s ease';
                    b.pinWrapper.style.transform = `translateX(${-targetX}px)`;
                    updatePinState(b.pin, targetX);
                }
            });
            await sleep(800);
            if (version !== currentTutorialVersion) break;
            solveBtn.click();
            while (solveBtn.disabled && version === currentTutorialVersion) await sleep(200);
            if (version !== currentTutorialVersion) break;
            positionArrowRelative(playBtn, 15, -40);
            await sleep(800);
            if (version !== currentTutorialVersion) break;
            playBtn.click();
            tutorialArrow.style.display = 'none';
            await sleep(3000);
        }
    } else {
        endTutorial();
    }
}
