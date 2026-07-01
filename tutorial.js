const
    tutorialOverlay = document.getElementById('tutorialOverlay'),
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
    function clean() {
        tutorialArrow.style.display = 'none';

        gameState.blocks.filter(b => b.x !== 0).forEach(b => {
            b.el.classList.remove(UI_CLASSES.SELECTED, UI_CLASSES.LINKED, UI_CLASSES.RINKED, UI_CLASSES.TOUCHED);
            b.el.querySelector('.front-face').style.borderColor = '';
            updateBlockState(b, {
                x: 0,
                transition: 'transform 0.5s ease',
                pinTime: b.pin.style.transform.includes(`translateZ(${PIN_RAISED}px`) ? null : 400
            })
        });

        if (6 !== +countInput.value && 3 !== tutorialStep) {
            countInput.value = 6;
            renderBlocks();
        }
    }

    clean();

    if (1 === tutorialStep) {

        clean();

        tutorialText.textContent = gameState.isMobile
            ? 'Use a two-finger pinch gesture on the screen to zoom in or out.'
            : 'Use the slider to adjust zooming.';

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
        clean();
        tutorialText.textContent = 'You can drag selected plates left or right.';
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
        tutorialText.textContent = 'Adjust plates like in a game: plates count and plates position.';
        while (version === currentTutorialVersion) {
            if (6 !== +countInput.value) {
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
                    updateBlockState(b, {x: positions[i] || 0, transition: 'transform 0.5s ease', pinTime: 400})
                });
                pIndex++;
                await sleep(1500);
            }
            clean();
            await sleep(1000);
        }
    } else if (4 === tutorialStep) {
        clean();
        tutorialText.textContent = 'Long-press to group plates. Blue moves with it, Red opposite. Tap again to deselect.';
        while (version === currentTutorialVersion) {
            clean();
            await sleep(1200);
            if (version !== currentTutorialVersion) break;
            if (gameState.blocks.length >= 3) {
                const p1 = gameState.blocks[0], p2 = gameState.blocks[1], p3 = gameState.blocks[2];
                p1.el.classList.add(UI_CLASSES.SELECTED);
                await sleep(800);
                if (version !== currentTutorialVersion) break;
                positionArrowRelative(p2.el, 10, -50);
                await sleep(600);
                p2.el.classList.add(UI_CLASSES.LINKED);
                await sleep(800);
                if (version !== currentTutorialVersion) break;
                positionArrowRelative(p3.el, 10, -50);
                await sleep(600);
                p3.el.classList.add(UI_CLASSES.RINKED);
                await sleep(800);
                if (version !== currentTutorialVersion) break;
                tutorialArrow.style.display = 'none';
                let offset = 0,
                    direction = 1;
                const maxLimit = HOLE_SPACING * 1.5,
                    totalFrames = 180;
                for (let i = 0; i <= totalFrames; i++) {
                    if (version !== currentTutorialVersion) break;
                    let progress = i / totalFrames,
                        offset = Math.sin(progress * Math.PI * 2) * maxLimit;
                    [{b: p1, dir: 1}, {b: p2, dir: 1}, {b: p3, dir: -1}].forEach(item => {
                        updateBlockState(item.b, {
                            x: offset * item.dir,
                            transition: 'none',
                            pinTransition: 'transform 0.03s ease-out'
                        })
                    });

                    await sleep(16);
                }

            } else await sleep(1000);
        }
    } else if (5 === tutorialStep) {
        clean();
        tutorialText.textContent = gameState.isMobile
            ? 'Touch the number row to see what groups are selected for plate'
            : 'Hover with mouse to understand what are selected for plate';
        while (version === currentTutorialVersion) {
            gameState.blocks.forEach(b => b.el.classList.remove(UI_CLASSES.SELECTED, UI_CLASSES.LINKED, UI_CLASSES.RINKED, UI_CLASSES.TOUCHED));
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
                p1.el.classList.add(UI_CLASSES.TOUCHED);
                p2.el.classList.add(UI_CLASSES.LINKED);
                p3.el.classList.add(UI_CLASSES.RINKED);
                await sleep(2000);
                if (version !== currentTutorialVersion) break;
                if (gameState.isMobile) {
                    const btn1 = inspectorRow.children[0];
                    if (btn1) btn1.style.background = btn1.dataset.defaultBg || '';
                }
                p1.el.classList.remove(UI_CLASSES.TOUCHED);
                p2.el.classList.remove(UI_CLASSES.LINKED);
                p3.el.classList.remove(UI_CLASSES.RINKED);
                tutorialArrow.style.display = 'none';
                await sleep(1000);
            } else await sleep(1000);
        }
    } else if (6 === tutorialStep) {
        clean();
        tutorialText.textContent = gameState.isMobile
            ? 'You can walk step-by-step by pressing step controls. If you hold it, it will move plates state-by-state.'
            : 'If squashed is checked, plates will go from state-to-state. Without squashed, you can walk single steps.';
        resetBtn.click();
        await sleep(200);
        if (version !== currentTutorialVersion) return;
        const hardState = [HOLE_SPACING * 2, -HOLE_SPACING, HOLE_SPACING * 3, -HOLE_SPACING * 2, HOLE_SPACING, -HOLE_SPACING];
        gameState.blocks.forEach((b, i) => {
            //todo a slight bug that dissapear first move of pin
            updateBlockState(b, {x: hardState[i] || 0, transition: 'transform 0.5s ease', pinTime: 400})
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
        clean();
        tutorialText.textContent = 'You can play the whole sequence automatically. Press the play button.';
        while (version === currentTutorialVersion) {
            resetBtn.click();
            await sleep(400);
            if (version !== currentTutorialVersion) break;
            const playState = [-HOLE_SPACING * 2, HOLE_SPACING * 2, -HOLE_SPACING, HOLE_SPACING, 0, -HOLE_SPACING];
            gameState.blocks.forEach((b, i) => {
                updateBlockState(b, {x: playState[i] || 0, transition: 'transform 0.5s ease', pinTime: 400})
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