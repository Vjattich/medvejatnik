const MIN = -3,MAX = 3;
self.onmessage = (event) => {
    try {
        const {n, start, effects, mode, timeoutMs} = event.data;
        const result = solve(n, start, effects, mode, timeoutMs);
        self.postMessage(result);
    } catch (error) {
        self.postMessage({error: error?.message || "Solver worker failed."});
    }
};
const keyOf = (values) => values.join(",");
const isGoal = (values) => values.every(v => v === 0);
const applyMove = (values, plate, direction, effects) => {
    const delta = "right" === direction ? 1 : -1;
    const next = [...values];
    const add = (index, amount) => {
        next[index - 1] += amount;
    };
    add(plate, delta);
    const row = effects[plate - 1] || [];
    for (let target = 1; target <= values.length; target++) {
        if (target === plate) continue;
        const relation = Number(row[target - 1] || 0);
        if (0 === relation) continue;
        add(target, 1 === relation ? delta : -delta);
    }
    if (next.some(v => v < MIN || v > MAX)) return null;
    return next;
};
const moveKeyOf = (move) => move ? move.plate + ":" + move.direction : "";
const searchKeyOf = (values, lastMoveKey) => keyOf(values) + "|" + (lastMoveKey || "start");
const compareCosts = (a, b, mode) => {
    if ("shortest" === mode) {
        if (a.moves !== b.moves) return a.moves - b.moves;
        return a.groups - b.groups;
    }
    if (a.groups !== b.groups) return a.groups - b.groups;
    return a.moves - b.moves;
};
const hasSameCost = (a, b) => !!a && !!b && a.moves === b.moves && a.groups === b.groups;
const createPriorityQueue = (compare) => {
    const items = [];
    const swap = (a, b) => {
        [items[a], items[b]] = [items[b], items[a]];
    };
    const bubbleUp = (index) => {
        while (0 < index) {
            const parent = Math.floor((index - 1) / 2);
            if (0 <= compare(items[index], items[parent])) break;
            swap(index, parent);
            index = parent;
        }
    };
    const bubbleDown = (index) => {
        while (true) {
            const left = index * 2 + 1;
            const right = index * 2 + 2;
            let smallest = index;
            if (left < items.length && 0 > compare(items[left], items[smallest])) smallest = left;
            if (right < items.length && 0 > compare(items[right], items[smallest])) smallest = right;
            if (smallest === index) break;
            swap(index, smallest);
            index = smallest;
        }
    };
    return {
        push: (value) => {
            items.push(value);
            bubbleUp(items.length - 1);
        },
        pop: () => {
            if (0 === items.length) return undefined;
            const first = items[0];
            const last = items.pop();
            if (0 < items.length) {
                items[0] = last;
                bubbleDown(0);
            }
            return first;
        },
        get length() {
            return items.length;
        }
    };
};
const buildSolutionFromNodes = (goalIndex, nodes) => {
    const moves = [];
    const states = [];
    let index = goalIndex;
    while (-1 !== index) {
        const node = nodes[index];
        states.push(node.values);
        if (node.move) {
            const count = node.move.count || 1;
            for (let i = 0; i < count; i++) {
                moves.push({plate: node.move.plate, direction: node.move.direction});
            }
        }
        index = node.prev;
    }
    moves.reverse();
    states.reverse();
    return {moves, states};
};
const solveWithPriority = (n, start, effects, mode, timeoutMs) => {
    if (isGoal(start)) return {moves: [], states: [start]};
    const nodes = [{values: start, prev: -1, move: null, moves: 0, groups: 0, lastMoveKey: ""}];
    const best = new Map([[searchKeyOf(start, ""), {moves: 0, groups: 0}]]);
    const queue = createPriorityQueue((a, b) => {
        const result = compareCosts(nodes[a], nodes[b], mode);
        return 0 !== result ? result : a - b;
    });
    queue.push(0);
    const startTime = Date.now();
    while (0 < queue.length) {
        if (Date.now() - startTime > timeoutMs) return {timeout: true};
        const currentIndex = queue.pop();
        const current = nodes[currentIndex];
        const currentKey = searchKeyOf(current.values, current.lastMoveKey);
        const currentBest = best.get(currentKey);
        if (!hasSameCost(current, currentBest)) continue;
        if (isGoal(current.values)) return buildSolutionFromNodes(currentIndex, nodes);
        for (let plate = 1; plate <= n; plate++) {
            for (const direction of ["left", "right"]) {
                const nextValues = applyMove(current.values, plate, direction, effects);
                if (!nextValues) continue;
                const move = {plate, direction};
                const nextMoveKey = moveKeyOf(move);
                const nextCost = {
                    moves: current.moves + 1,
                    groups: current.groups + (current.lastMoveKey === nextMoveKey ? 0 : 1)
                };
                const nextKey = searchKeyOf(nextValues, nextMoveKey);
                const previousBest = best.get(nextKey);
                if (previousBest && 0 <= compareCosts(nextCost, previousBest, mode)) continue;
                const nextIndex = nodes.length;
                best.set(nextKey, nextCost);
                nodes.push({
                    values: nextValues,
                    prev: currentIndex,
                    move,
                    moves: nextCost.moves,
                    groups: nextCost.groups,
                    lastMoveKey: nextMoveKey
                });
                queue.push(nextIndex);
            }
        }
    }
    return null;
};
const solveFastShortestMoves = (n, start, effects, timeoutMs) => {
    if (isGoal(start)) return {moves: [], states: [start]};
    const nodes = [{values: start, prev: -1, move: null}];
    const queue = [0];
    const seen = new Set([keyOf(start)]);
    let head = 0;
    const startTime = Date.now();
    while (head < queue.length) {
        if (Date.now() - startTime > timeoutMs) return {timeout: true};
        const currentIndex = queue[head++];
        const current = nodes[currentIndex];
        for (let plate = 1; plate <= n; plate++) {
            for (const direction of ["left", "right"]) {
                const nextValues = applyMove(current.values, plate, direction, effects);
                if (!nextValues) continue;
                const key = keyOf(nextValues);
                if (seen.has(key)) continue;
                seen.add(key);
                const nextIndex = nodes.length;
                nodes.push({values: nextValues, prev: currentIndex, move: {plate, direction}});
                if (isGoal(nextValues)) return buildSolutionFromNodes(nextIndex, nodes);
                queue.push(nextIndex);
            }
        }
    }
    return null;
};
const solveFastFewerPlateSwitches = (n, start, effects, timeoutMs) => {
    if (isGoal(start)) return {moves: [], states: [start]};
    const nodes = [{values: start, prev: -1, move: null}];
    const queue = [0];
    const seen = new Set([keyOf(start)]);
    let head = 0;
    const startTime = Date.now();
    while (head < queue.length) {
        if (Date.now() - startTime > timeoutMs) return {timeout: true};
        const currentIndex = queue[head++];
        const current = nodes[currentIndex];
        for (let plate = 1; plate <= n; plate++) {
            for (const direction of ["left", "right"]) {
                let chainValues = current.values;
                for (let count = 1; ; count++) {
                    chainValues = applyMove(chainValues, plate, direction, effects);
                    if (!chainValues) break;
                    const key = keyOf(chainValues);
                    if (seen.has(key)) continue;
                    seen.add(key);
                    const nextIndex = nodes.length;
                    nodes.push({values: chainValues, prev: currentIndex, move: {plate, direction, count}});
                    if (isGoal(chainValues)) return buildSolutionFromNodes(nextIndex, nodes);
                    queue.push(nextIndex);
                }
            }
        }
    }
    return null;
};
const solve = (n, start, effects, mode, timeoutMs) => {
    if ("shortest" === mode) return solveWithPriority(n, start, effects, "shortest", timeoutMs);
    if ("shortest-fast" === mode) return solveFastShortestMoves(n, start, effects, timeoutMs);
    if ("fewer-switches-fast" === mode) return solveFastFewerPlateSwitches(n, start, effects, timeoutMs);
    return solveWithPriority(n, start, effects, "fewer-switches", timeoutMs);
};
