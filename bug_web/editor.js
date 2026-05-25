// Spiking network editor: nodes + arrows + frames on canvas, live activity,
// traveling pulses, pan/zoom, multi-select, rectangle selection, frame tool.

(function () {
    const canvas = document.getElementById('net-canvas');
    const ctx = canvas.getContext('2d');
    const toolGroup = document.getElementById('net-tool-group');
    const resetViewBtn = document.getElementById('net-reset-view');

    const propsEmpty   = document.getElementById('props-empty');
    const propsNeuron  = document.getElementById('props-neuron');
    const propsSynapse = document.getElementById('props-synapse');
    const propsGroup   = document.getElementById('props-group');
    const propsMulti   = document.getElementById('props-multi');
    const tooltipEl    = document.getElementById('net-tooltip');

    let topology = { neurons: [], synapses: [], groups: [] };
    let defaultIds = new Set();
    let neuronById = new Map();
    let synapseKey = (f, t) => f + '->' + t;
    let synapseByKey = new Map();
    let groupById = new Map();

    // Per-frame cache of label bounding rects (in world coords), filled by
    // drawGroup; consumed by the mousemove handler to drive the tooltip.
    let groupLabelRects = new Map();   // gid -> {x, y, w, h, comment}

    let activity = { potentials: [], spike_counts: [], ids: [] };
    let activityIndex = new Map();
    let pulses = { from_idx: [], to_idx: [], progress: [], duration: [], sign: [] };
    let lastPulseRecvMs = 0;
    let spikeFlash = new Map();

    // Selection: either a single thing or a multi-set of neuron IDs
    let selected = null;        // { type, ... } or { type: 'multi', neuronIds: Set<string> }
    let connectFrom = null;
    let dragging = null;        // { mode: 'neuron'|'group', id?, ids?, startX, startY, origs: Map }
    let groupResize = null;     // { id, anchorX, anchorY }
    let drawingFrame = null;    // { x0, y0, x, y }
    let selectRect = null;      // { x0, y0, x, y }
    let lastMouseWorld = { x: 0, y: 0 };
    let lastFrameTime = performance.now();
    let panning = null;
    let pendingMultiDragPositions = null; // Map<id, {x, y}> — guards setTopology during multi-drag commit
    let copiedPattern = null;  // { neurons: [{id, label, kind, dx, dy, threshold, leak, v_reset, refractory, noise_std}], synapses: [{fromIdx, toIdx, weight, delay}] }
    let pasteMode = false;     // when true, next click on canvas places the pattern

    let currentTool = 'select';
    const NODE_R = 18;

    const view = { scale: 1, tx: 0, ty: 0 };
    const MIN_SCALE = 0.25, MAX_SCALE = 6;

    toolGroup.addEventListener('click', (e) => {
        const b = e.target.closest('.tool-btn');
        if (!b) return;
        currentTool = b.dataset.tool;
        toolGroup.querySelectorAll('.tool-btn').forEach(x => x.classList.toggle('active', x === b));
        if (currentTool !== 'add-synapse') connectFrom = null;
    });
    resetViewBtn.addEventListener('click', () => {
        view.scale = 1; view.tx = 0; view.ty = 0;
    });

    function resizeCanvas() {
        const r = canvas.getBoundingClientRect();
        canvas.width  = Math.max(400, Math.floor(r.width));
        canvas.height = Math.max(300, Math.floor(r.height));
    }
    window.addEventListener('resize', resizeCanvas);
    setTimeout(resizeCanvas, 0);

    function mouseScreen(e) {
        const r = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - r.left) * (canvas.width / r.width),
            y: (e.clientY - r.top)  * (canvas.height / r.height),
        };
    }
    function screenToWorld(p) {
        return { x: (p.x - view.tx) / view.scale, y: (p.y - view.ty) / view.scale };
    }
    function mouseWorld(e) { return screenToWorld(mouseScreen(e)); }

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const m = mouseScreen(e);
        const before = screenToWorld(m);
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        view.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.scale * factor));
        view.tx = m.x - before.x * view.scale;
        view.ty = m.y - before.y * view.scale;
    }, { passive: false });

    // -------------------------------------------------------- hit testing

    function findNeuronAt(w) {
        for (let i = topology.neurons.length - 1; i >= 0; i--) {
            const n = topology.neurons[i];
            if ((n.x - w.x) ** 2 + (n.y - w.y) ** 2 < NODE_R * NODE_R) return n;
        }
        return null;
    }
    function findSynapseAt(w) {
        let best = null, bestDist = 10;
        for (const s of topology.synapses) {
            const a = neuronById.get(s.from);
            const b = neuronById.get(s.to);
            if (!a || !b) continue;
            const g = synapseGeometry(a.x, a.y, b.x, b.y);
            if (!g) continue;
            const d = pointBezierDist(w.x, w.y, g.sx, g.sy, g.cx, g.cy, g.ex, g.ey);
            if (d < bestDist) { bestDist = d; best = s; }
        }
        return best;
    }
    function findGroupAt(w) {
        // Front-most last drawn = last in list; iterate reverse
        for (let i = topology.groups.length - 1; i >= 0; i--) {
            const g = topology.groups[i];
            if (w.x >= g.x && w.x <= g.x + g.w && w.y >= g.y && w.y <= g.y + g.h) {
                return g;
            }
        }
        return null;
    }
    function pointSegDist(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * dx + (py - y1) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }
    // Sampled distance to a quadratic Bezier — accurate enough for a few-px
    // tolerance, and lets reciprocal synapses (which curve to opposite sides)
    // resolve correctly under the cursor.
    function pointBezierDist(px, py, sx, sy, cx, cy, ex, ey, samples = 14) {
        let best = Infinity;
        let prevX = sx, prevY = sy;
        for (let i = 1; i <= samples; i++) {
            const t = i / samples;
            const it = 1 - t;
            const x = it * it * sx + 2 * it * t * cx + t * t * ex;
            const y = it * it * sy + 2 * it * t * cy + t * t * ey;
            const d = pointSegDist(px, py, prevX, prevY, x, y);
            if (d < best) best = d;
            prevX = x; prevY = y;
        }
        return best;
    }

    // ------------------------------------------------------- mouse events

    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 1 || (e.button === 0 && e.shiftKey && currentTool !== 'select')) {
            const m = mouseScreen(e);
            panning = { sx: m.x, sy: m.y, tx: view.tx, ty: view.ty };
            e.preventDefault(); return;
        }
        if (e.button !== 0) return;

        const w = mouseWorld(e);
        lastMouseWorld = w;

        // Paste mode: place pattern at click position
        if (pasteMode) {
            pastePatternAt(w.x, w.y);
            return;
        }

        const n = findNeuronAt(w);

        if (currentTool === 'add-neuron') {
            if (n) return;
            const id = 'n' + Date.now().toString(36) + Math.floor(Math.random() * 100);
            window.appSocket.emit('add_neuron', {
                id, label: id, kind: 'inter',
                x: w.x, y: w.y,
                threshold: 1.0, leak: 0.1, v_reset: 0, v_min: -100, refractory: 2, noise_std: 0,
            });
            return;
        }

        if (currentTool === 'add-synapse') {
            if (!n) { connectFrom = null; return; }
            if (!connectFrom) {
                connectFrom = n.id;
            } else {
                if (connectFrom !== n.id) {
                    window.appSocket.emit('add_synapse', {
                        from: connectFrom, to: n.id, weight: 1.0, delay: 5,
                    });
                }
                connectFrom = null;
            }
            return;
        }

        if (currentTool === 'add-frame') {
            drawingFrame = { x0: w.x, y0: w.y, x: w.x, y: w.y };
            return;
        }

        if (currentTool === 'delete') {
            if (n) {
                if (defaultIds.has(n.id)) { alert('Cannot delete system neuron'); return; }
                window.appSocket.emit('remove_neuron', { id: n.id });
                clearSelection();
                return;
            }
            const s = findSynapseAt(w);
            if (s) { window.appSocket.emit('remove_synapse', { from: s.from, to: s.to }); clearSelection(); return; }
            const g = findGroupAt(w);
            if (g) { window.appSocket.emit('remove_group', { id: g.id }); clearSelection(); return; }
            return;
        }

        // ---- select tool ----
        if (n) {
            // If neuron is part of multi-selection, drag the group; otherwise single-select.
            if (selected && selected.type === 'multi' && selected.neuronIds.has(n.id) && !e.shiftKey) {
                startMultiDrag(w);
            } else if (e.shiftKey) {
                toggleNeuronInSelection(n);
                if (selected && selected.type === 'multi') startMultiDrag(w);
            } else {
                selectNeuron(n);
                dragging = { mode: 'neuron', id: n.id, dx: w.x - n.x, dy: w.y - n.y };
            }
            return;
        }
        const s = findSynapseAt(w);
        if (s && !e.shiftKey) { selectSynapse(s); return; }

        const g = findGroupAt(w);
        if (g && !e.shiftKey) {
            // Group corner resize handle?
            const cornerSize = 14 / view.scale;
            if (Math.abs(w.x - (g.x + g.w)) < cornerSize && Math.abs(w.y - (g.y + g.h)) < cornerSize) {
                selectGroup(g);
                groupResize = { id: g.id };
                return;
            }
            selectGroup(g);
            dragging = { mode: 'group', id: g.id, dx: w.x - g.x, dy: w.y - g.y };
            return;
        }

        // Empty: start selection rect
        selectRect = { x0: w.x, y0: w.y, x: w.x, y: w.y, additive: e.shiftKey };
    });

    canvas.addEventListener('mousemove', (e) => {
        if (panning) {
            const m = mouseScreen(e);
            view.tx = panning.tx + (m.x - panning.sx);
            view.ty = panning.ty + (m.y - panning.sy);
            return;
        }
        const w = mouseWorld(e);
        lastMouseWorld = w;
        updateTooltip(e, w);

        if (drawingFrame) { drawingFrame.x = w.x; drawingFrame.y = w.y; return; }
        if (selectRect)   { selectRect.x = w.x; selectRect.y = w.y; return; }

        if (groupResize) {
            const g = groupById.get(groupResize.id);
            if (g) {
                g.w = Math.max(40, w.x - g.x);
                g.h = Math.max(30, w.y - g.y);
            }
            return;
        }

        if (dragging) {
            if (dragging.mode === 'neuron') {
                const n = neuronById.get(dragging.id);
                if (n) { n.x = w.x - dragging.dx; n.y = w.y - dragging.dy; }
            } else if (dragging.mode === 'multi') {
                const dx = w.x - dragging.startX, dy = w.y - dragging.startY;
                for (const [id, [ox, oy]] of dragging.origs) {
                    const n = neuronById.get(id);
                    if (n) { n.x = ox + dx; n.y = oy + dy; }
                }
            } else if (dragging.mode === 'group') {
                const g = groupById.get(dragging.id);
                if (g) { g.x = w.x - dragging.dx; g.y = w.y - dragging.dy; }
            }
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        if (panning) { panning = null; return; }

        if (drawingFrame) {
            const x0 = Math.min(drawingFrame.x0, drawingFrame.x);
            const y0 = Math.min(drawingFrame.y0, drawingFrame.y);
            const w = Math.max(40, Math.abs(drawingFrame.x - drawingFrame.x0));
            const h = Math.max(30, Math.abs(drawingFrame.y - drawingFrame.y0));
            const id = 'g' + Date.now().toString(36) + Math.floor(Math.random() * 100);
            window.appSocket.emit('add_group', {
                id, x: x0, y: y0, w, h, label: 'Group', color: '#3a5cff', comment: '',
            });
            drawingFrame = null;
            return;
        }

        if (selectRect) {
            const w = mouseWorld(e);
            selectRect.x = w.x; selectRect.y = w.y;
            const x0 = Math.min(selectRect.x0, selectRect.x);
            const y0 = Math.min(selectRect.y0, selectRect.y);
            const x1 = Math.max(selectRect.x0, selectRect.x);
            const y1 = Math.max(selectRect.y0, selectRect.y);
            const collected = new Set(selectRect.additive && selected?.type === 'multi'
                ? selected.neuronIds : []);
            // Treat a tiny "rect" as a no-op click (clear selection)
            const tiny = (x1 - x0) < 4 && (y1 - y0) < 4;
            if (!tiny) {
                for (const n of topology.neurons) {
                    if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1) {
                        collected.add(n.id);
                    }
                }
            }
            selectRect = null;
            if (collected.size === 0) clearSelection();
            else if (collected.size === 1) {
                const id = [...collected][0];
                const n = neuronById.get(id);
                if (n) selectNeuron(n); else clearSelection();
            } else {
                setMultiSelection(collected);
            }
            return;
        }

        if (groupResize) {
            const g = groupById.get(groupResize.id);
            if (g) window.appSocket.emit('update_group',
                { id: g.id, x: g.x, y: g.y, w: g.w, h: g.h });
            groupResize = null;
            return;
        }

        if (dragging) {
            if (dragging.mode === 'neuron') {
                const n = neuronById.get(dragging.id);
                if (n) window.appSocket.emit('update_neuron', { id: n.id, x: n.x, y: n.y });
            } else if (dragging.mode === 'multi') {
                // Snapshot final positions before emitting, because each
                // update_neuron triggers setTopology which rebuilds neuronById
                // from server data and would reset not-yet-sent positions.
                const finalPositions = [];
                for (const id of dragging.origs.keys()) {
                    const n = neuronById.get(id);
                    if (n) finalPositions.push({ id: n.id, x: n.x, y: n.y });
                }
                // Store positions so setTopology can preserve them
                pendingMultiDragPositions = new Map(finalPositions.map(p => [p.id, { x: p.x, y: p.y }]));
                for (const pos of finalPositions) {
                    window.appSocket.emit('update_neuron', pos);
                }
                pendingMultiDragPositions = null;
            } else if (dragging.mode === 'group') {
                const g = groupById.get(dragging.id);
                if (g) window.appSocket.emit('update_group',
                    { id: g.id, x: g.x, y: g.y, w: g.w, h: g.h });
            }
            dragging = null;
        }
    });
    canvas.addEventListener('mouseleave', () => {
        panning = null; dragging = null;
        drawingFrame = null; selectRect = null; groupResize = null;
        tooltipEl.classList.add('hidden');
    });

    function updateTooltip(e, w) {
        // Find a group label rectangle (world coords) under cursor.
        let hit = null;
        for (const r of groupLabelRects.values()) {
            if (w.x >= r.x && w.x <= r.x + r.w && w.y >= r.y && w.y <= r.y + r.h) {
                hit = r; break;
            }
        }
        if (hit && hit.comment) {
            const wrap = canvas.parentElement;
            const wrapRect = wrap.getBoundingClientRect();
            tooltipEl.textContent = hit.comment;
            // Position relative to the .net-wrap parent (position: relative).
            tooltipEl.style.left = (e.clientX - wrapRect.left + 14) + 'px';
            tooltipEl.style.top  = (e.clientY - wrapRect.top  + 14) + 'px';
            tooltipEl.classList.remove('hidden');
        } else {
            tooltipEl.classList.add('hidden');
        }
    }

    // Delete-key removes whatever is selected
    window.addEventListener('keydown', (e) => {
        if (e.target.matches('input, textarea, select')) return;
        if (e.key !== 'Delete' && e.key !== 'Backspace') return;
        if (!selected) return;
        if (selected.type === 'neuron') {
            if (defaultIds.has(selected.id)) return;
            window.appSocket.emit('remove_neuron', { id: selected.id });
            clearSelection();
        } else if (selected.type === 'synapse') {
            window.appSocket.emit('remove_synapse', { from: selected.from, to: selected.to });
            clearSelection();
        } else if (selected.type === 'group') {
            window.appSocket.emit('remove_group', { id: selected.id });
            clearSelection();
        } else if (selected.type === 'multi') {
            for (const id of selected.neuronIds) {
                if (defaultIds.has(id)) continue;
                window.appSocket.emit('remove_neuron', { id });
            }
            clearSelection();
        }
    });

    // -------------------------------------------------------- selection ui

    function clearSelection() {
        selected = null;
        propsEmpty.classList.remove('hidden');
        propsNeuron.classList.add('hidden');
        propsSynapse.classList.add('hidden');
        propsGroup.classList.add('hidden');
        propsMulti.classList.add('hidden');
    }
    function showOnly(panel) {
        propsEmpty.classList.add('hidden');
        propsNeuron.classList.toggle('hidden', panel !== propsNeuron);
        propsSynapse.classList.toggle('hidden', panel !== propsSynapse);
        propsGroup.classList.toggle('hidden', panel !== propsGroup);
        propsMulti.classList.toggle('hidden', panel !== propsMulti);
    }
    function selectNeuron(n) {
        selected = { type: 'neuron', id: n.id };
        showOnly(propsNeuron);
        document.getElementById('prop-n-id').textContent = n.id;
        document.getElementById('prop-n-kind').textContent = n.kind;
        document.getElementById('prop-n-label').value = n.label;
        document.getElementById('prop-n-threshold').value = n.threshold.toFixed(3);
        document.getElementById('prop-n-leak').value = n.leak.toFixed(3);
        document.getElementById('prop-n-reset').value = n.v_reset.toFixed(3);
        document.getElementById('prop-n-vmin').value = (n.v_min !== undefined ? n.v_min : -100);
        document.getElementById('prop-n-refr').value = n.refractory;
        document.getElementById('prop-n-noise').value = (n.noise_std || 0).toFixed(3);
        document.getElementById('prop-n-delete').disabled = defaultIds.has(n.id);
    }
    function selectSynapse(s) {
        selected = { type: 'synapse', from: s.from, to: s.to };
        showOnly(propsSynapse);
        document.getElementById('prop-s-from').textContent = s.from;
        document.getElementById('prop-s-to').textContent = s.to;
        document.getElementById('prop-s-weight').value = s.weight.toFixed(3);
        document.getElementById('prop-s-delay').value = s.delay || 1;
    }
    function selectGroup(g) {
        selected = { type: 'group', id: g.id };
        showOnly(propsGroup);
        document.getElementById('prop-g-id').textContent = g.id;
        document.getElementById('prop-g-label').value = g.label || '';
        document.getElementById('prop-g-color').value = g.color || '#3a5cff';
        document.getElementById('prop-g-comment').value = g.comment || '';
    }
    function setMultiSelection(ids) {
        selected = { type: 'multi', neuronIds: ids };
        showOnly(propsMulti);
        document.getElementById('prop-multi-info').textContent =
            `selected neurons: ${ids.size}`;
    }
    function toggleNeuronInSelection(n) {
        if (!selected || selected.type !== 'multi') {
            if (selected && selected.type === 'neuron') {
                const set = new Set([selected.id]);
                if (set.has(n.id)) set.delete(n.id); else set.add(n.id);
                if (set.size === 0) clearSelection();
                else if (set.size === 1) selectNeuron(neuronById.get([...set][0]));
                else setMultiSelection(set);
            } else {
                setMultiSelection(new Set([n.id]));
            }
        } else {
            const set = new Set(selected.neuronIds);
            if (set.has(n.id)) set.delete(n.id); else set.add(n.id);
            if (set.size === 0) clearSelection();
            else if (set.size === 1) selectNeuron(neuronById.get([...set][0]));
            else setMultiSelection(set);
        }
    }
    function startMultiDrag(w) {
        if (!selected || selected.type !== 'multi') return;
        const origs = new Map();
        for (const id of selected.neuronIds) {
            const n = neuronById.get(id);
            if (n) origs.set(id, [n.x, n.y]);
        }
        dragging = { mode: 'multi', startX: w.x, startY: w.y, origs };
    }

    // Property-panel actions
    document.getElementById('prop-n-apply').addEventListener('click', () => {
        if (!selected || selected.type !== 'neuron') return;
        window.appSocket.emit('update_neuron', {
            id: selected.id,
            label: document.getElementById('prop-n-label').value,
            threshold: parseFloat(document.getElementById('prop-n-threshold').value),
            leak: parseFloat(document.getElementById('prop-n-leak').value),
            v_reset: parseFloat(document.getElementById('prop-n-reset').value),
            v_min: parseFloat(document.getElementById('prop-n-vmin').value) || -100,
            refractory: parseInt(document.getElementById('prop-n-refr').value, 10),
            noise_std: parseFloat(document.getElementById('prop-n-noise').value) || 0,
        });
    });
    document.getElementById('prop-n-delete').addEventListener('click', () => {
        if (!selected || selected.type !== 'neuron') return;
        if (defaultIds.has(selected.id)) return;
        window.appSocket.emit('remove_neuron', { id: selected.id });
        clearSelection();
    });
    document.getElementById('prop-s-apply').addEventListener('click', () => {
        if (!selected || selected.type !== 'synapse') return;
        window.appSocket.emit('add_synapse', {
            from: selected.from, to: selected.to,
            weight: parseFloat(document.getElementById('prop-s-weight').value),
            delay:  parseInt(document.getElementById('prop-s-delay').value, 10) || 1,
        });
    });
    document.getElementById('prop-s-delete').addEventListener('click', () => {
        if (!selected || selected.type !== 'synapse') return;
        window.appSocket.emit('remove_synapse', { from: selected.from, to: selected.to });
        clearSelection();
    });
    document.getElementById('prop-g-apply').addEventListener('click', () => {
        if (!selected || selected.type !== 'group') return;
        window.appSocket.emit('update_group', {
            id: selected.id,
            label: document.getElementById('prop-g-label').value,
            color: document.getElementById('prop-g-color').value,
            comment: document.getElementById('prop-g-comment').value,
        });
    });
    document.getElementById('prop-g-delete').addEventListener('click', () => {
        if (!selected || selected.type !== 'group') return;
        window.appSocket.emit('remove_group', { id: selected.id });
        clearSelection();
    });
    document.getElementById('prop-multi-delete').addEventListener('click', () => {
        if (!selected || selected.type !== 'multi') return;
        for (const id of selected.neuronIds) {
            if (defaultIds.has(id)) continue;
            window.appSocket.emit('remove_neuron', { id });
        }
        clearSelection();
    });

    // ---- Copy / Paste pattern ----
    function copyPattern() {
        if (!selected || selected.type !== 'multi') return;
        const ids = selected.neuronIds;
        const neurons = [];
        for (const id of ids) {
            const n = neuronById.get(id);
            if (n) neurons.push(n);
        }
        if (neurons.length === 0) return;
        // Compute centroid
        let cx = 0, cy = 0;
        for (const n of neurons) { cx += n.x; cy += n.y; }
        cx /= neurons.length; cy /= neurons.length;
        // Store neurons with relative positions
        const patternNeurons = neurons.map(n => ({
            origId: n.id,
            label: n.label,
            kind: n.kind,
            dx: n.x - cx,
            dy: n.y - cy,
            threshold: n.threshold,
            leak: n.leak,
            v_reset: n.v_reset,
            v_min: n.v_min !== undefined ? n.v_min : -100,
            refractory: n.refractory,
            noise_std: n.noise_std,
        }));
        // Build index for synapse lookup
        const idToPatternIdx = new Map();
        patternNeurons.forEach((pn, idx) => idToPatternIdx.set(pn.origId, idx));
        // Collect internal synapses (both from and to are in the selection)
        const patternSynapses = [];
        for (const s of topology.synapses) {
            if (idToPatternIdx.has(s.from) && idToPatternIdx.has(s.to)) {
                patternSynapses.push({
                    fromIdx: idToPatternIdx.get(s.from),
                    toIdx: idToPatternIdx.get(s.to),
                    weight: s.weight,
                    delay: s.delay,
                });
            }
        }
        copiedPattern = { neurons: patternNeurons, synapses: patternSynapses };
        pasteMode = false;
        // Update paste button visibility
        const pasteBtn = document.getElementById('prop-multi-paste');
        if (pasteBtn) pasteBtn.style.opacity = '1';
    }

    function activatePasteMode() {
        if (!copiedPattern) return;
        pasteMode = true;
        clearSelection();
        canvas.style.cursor = 'copy';
    }

    function pastePatternAt(wx, wy) {
        if (!copiedPattern || !pasteMode) return;
        pasteMode = false;
        canvas.style.cursor = '';
        const idMap = new Map(); // patternIdx -> new neuron id
        // Create neurons
        for (let i = 0; i < copiedPattern.neurons.length; i++) {
            const pn = copiedPattern.neurons[i];
            const newId = 'n' + Date.now().toString(36) + Math.floor(Math.random() * 1000) + '_' + i;
            idMap.set(i, newId);
            window.appSocket.emit('add_neuron', {
                id: newId,
                label: pn.label,
                kind: pn.kind,
                x: wx + pn.dx,
                y: wy + pn.dy,
                threshold: pn.threshold,
                leak: pn.leak,
                v_reset: pn.v_reset,
                v_min: pn.v_min !== undefined ? pn.v_min : -100,
                refractory: pn.refractory,
                noise_std: pn.noise_std,
            });
        }
        // Create synapses (with a small delay to ensure neurons exist)
        setTimeout(() => {
            for (const ps of copiedPattern.synapses) {
                window.appSocket.emit('add_synapse', {
                    from: idMap.get(ps.fromIdx),
                    to: idMap.get(ps.toIdx),
                    weight: ps.weight,
                    delay: ps.delay,
                });
            }
        }, 50);
    }

    document.getElementById('prop-multi-copy').addEventListener('click', copyPattern);
    document.getElementById('prop-multi-paste').addEventListener('click', activatePasteMode);

    // Ctrl+C / Ctrl+V keyboard shortcuts for pattern copy/paste
    window.addEventListener('keydown', (e) => {
        if (e.target.matches('input, textarea, select')) return;
        if (e.ctrlKey && e.key === 'c') {
            if (selected && selected.type === 'multi') {
                e.preventDefault();
                copyPattern();
            }
        }
        if (e.ctrlKey && e.key === 'v') {
            if (copiedPattern) {
                e.preventDefault();
                activatePasteMode();
            }
        }
        if (e.key === 'Escape' && pasteMode) {
            pasteMode = false;
            canvas.style.cursor = '';
        }
    });

    // ----------------------------------------------------------- rendering

    const KIND_COLOR = {
        sensor: '#34d2ff',
        motor:  '#ff8a3a',
        inter:  '#9be37c',
    };
    const KIND_RGB = {};
    for (const k in KIND_COLOR) KIND_RGB[k] = hexToRgb(KIND_COLOR[k]);
    const KIND_OUTLINE = {};
    for (const k in KIND_COLOR) {
        const c = KIND_RGB[k];
        KIND_OUTLINE[k] = `rgb(${Math.round(c.r * 0.6)},${Math.round(c.g * 0.6)},${Math.round(c.b * 0.6)})`;
    }

    function draw() {
        const now = performance.now();
        const dtMs = now - lastFrameTime;
        lastFrameTime = now;

        groupLabelRects.clear();

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#0a0d14';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.setTransform(view.scale, 0, 0, view.scale, view.tx, view.ty);

        // Grid
        ctx.strokeStyle = '#101622';
        ctx.lineWidth = 1 / view.scale;
        const left = -view.tx / view.scale;
        const top = -view.ty / view.scale;
        const right = left + canvas.width / view.scale;
        const bot = top + canvas.height / view.scale;
        const step = 50;
        const gx0 = Math.floor(left / step) * step;
        const gy0 = Math.floor(top / step) * step;
        ctx.beginPath();
        for (let x = gx0; x <= right; x += step) { ctx.moveTo(x, top); ctx.lineTo(x, bot); }
        for (let y = gy0; y <= bot; y += step) { ctx.moveTo(left, y); ctx.lineTo(right, y); }
        ctx.stroke();

        // Groups (behind everything)
        for (const g of topology.groups) drawGroup(g);

        // Synapses
        for (const s of topology.synapses) {
            const a = neuronById.get(s.from);
            const b = neuronById.get(s.to);
            if (!a || !b) continue;
            const isSel = selected && selected.type === 'synapse'
                && selected.from === s.from && selected.to === s.to;
            drawArrow(a.x, a.y, b.x, b.y, s.weight, isSel);
        }

        // Connecting line preview
        if (connectFrom) {
            const a = neuronById.get(connectFrom);
            if (a) {
                ctx.strokeStyle = '#7aa0ff';
                ctx.lineWidth = 1.5 / view.scale;
                ctx.setLineDash([4 / view.scale, 3 / view.scale]);
                ctx.beginPath(); ctx.moveTo(a.x, a.y);
                ctx.lineTo(lastMouseWorld.x, lastMouseWorld.y);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        // Pulses (drawn over synapses, under neurons)
        drawPulses(now);

        // Neurons
        for (const n of topology.neurons) drawNeuron(n, dtMs);

        // In-progress frame
        if (drawingFrame) {
            const x = Math.min(drawingFrame.x0, drawingFrame.x);
            const y = Math.min(drawingFrame.y0, drawingFrame.y);
            const w = Math.abs(drawingFrame.x - drawingFrame.x0);
            const h = Math.abs(drawingFrame.y - drawingFrame.y0);
            ctx.strokeStyle = '#7aa0ff'; ctx.lineWidth = 1.5 / view.scale;
            ctx.setLineDash([4 / view.scale, 3 / view.scale]);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);
        }

        // Selection rect
        if (selectRect) {
            const x = Math.min(selectRect.x0, selectRect.x);
            const y = Math.min(selectRect.y0, selectRect.y);
            const w = Math.abs(selectRect.x - selectRect.x0);
            const h = Math.abs(selectRect.y - selectRect.y0);
            ctx.fillStyle = 'rgba(120, 160, 255, 0.10)';
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = '#7aa0ff'; ctx.lineWidth = 1 / view.scale;
            ctx.setLineDash([5 / view.scale, 4 / view.scale]);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);
        }

        // Paste preview (ghost of the pattern following the cursor)
        if (pasteMode && copiedPattern) {
            ctx.globalAlpha = 0.4;
            // Draw ghost synapses
            for (const ps of copiedPattern.synapses) {
                const a = copiedPattern.neurons[ps.fromIdx];
                const b = copiedPattern.neurons[ps.toIdx];
                const ax = lastMouseWorld.x + a.dx, ay = lastMouseWorld.y + a.dy;
                const bx = lastMouseWorld.x + b.dx, by = lastMouseWorld.y + b.dy;
                ctx.strokeStyle = ps.weight >= 0 ? '#78c8ff' : '#ff8c8c';
                ctx.lineWidth = 1.5 / view.scale;
                ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
            }
            // Draw ghost neurons
            for (const pn of copiedPattern.neurons) {
                const px = lastMouseWorld.x + pn.dx;
                const py = lastMouseWorld.y + pn.dy;
                const rgb = KIND_RGB[pn.kind] || KIND_RGB.inter;
                ctx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
                ctx.beginPath(); ctx.arc(px, py, NODE_R, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5 / view.scale;
                ctx.stroke();
            }
            ctx.globalAlpha = 1.0;
        }

        // HUD overlay (screen space)
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = 'rgba(180, 200, 255, 0.5)';
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(
            `zoom ${view.scale.toFixed(2)}× · wheel=zoom · Shift+drag=pan · Del=delete selection · neurons ${topology.neurons.length} · pulses ${pulses.from_idx.length}`,
            6, 6,
        );
    }

    function drawGroup(g) {
        const rgb = hexToRgb(g.color || '#3a5cff');
        const isSel = selected && selected.type === 'group' && selected.id === g.id;
        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.10)`;
        ctx.fillRect(g.x, g.y, g.w, g.h);
        ctx.strokeStyle = isSel ? '#ffffff' : `rgba(${rgb.r},${rgb.g},${rgb.b},0.65)`;
        ctx.lineWidth = (isSel ? 2 : 1.2) / view.scale;
        ctx.strokeRect(g.x + 0.5 / view.scale, g.y + 0.5 / view.scale,
                       g.w - 1 / view.scale, g.h - 1 / view.scale);
        if (g.label) {
            const fontPx = 12 / Math.max(0.6, view.scale);
            ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.95)`;
            ctx.font = `bold ${fontPx}px -apple-system, "Segoe UI"`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            const lx = g.x + 6 / view.scale;
            const ly = g.y + 4 / view.scale;
            ctx.fillText(g.label, lx, ly);
            // Record label rect for tooltip hover (world coords)
            const m = ctx.measureText(g.label);
            const lw = m.width;
            const lh = fontPx * 1.2;
            groupLabelRects.set(g.id, {
                x: lx - 4 / view.scale,
                y: ly - 2 / view.scale,
                w: lw + 8 / view.scale,
                h: lh,
                comment: g.comment || '',
            });
            if (g.comment) {
                // Small "i" hint after the label
                ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.6)`;
                ctx.fillText('ⓘ', lx + lw + 4 / view.scale, ly);
            }
        }
        if (isSel) {
            const s = 8 / view.scale;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(g.x + g.w - s, g.y + g.h - s, s, s);
        }
    }

    const SYN_CURVE = 16;   // world-unit perpendicular bulge of the bezier
    function synapseGeometry(ax, ay, bx, by) {
        const dx = bx - ax, dy = by - ay;
        const len = Math.hypot(dx, dy);
        if (len < 1) return null;
        const ux = dx / len, uy = dy / len;
        const sx = ax + ux * NODE_R, sy = ay + uy * NODE_R;
        const ex = bx - ux * NODE_R, ey = by - uy * NODE_R;
        const mx = (sx + ex) / 2, my = (sy + ey) / 2;
        const nx = -uy, ny = ux;
        // Control point sits on the perpendicular bulge. The sign of (nx, ny)
        // flips when from/to are swapped (b→a vs a→b), so reciprocal synapses
        // bow to opposite sides automatically.
        const cx = mx + nx * SYN_CURVE, cy = my + ny * SYN_CURVE;
        return { sx, sy, ex, ey, cx, cy };
    }

    function drawArrow(x1, y1, x2, y2, weight, isSel) {
        const g = synapseGeometry(x1, y1, x2, y2);
        if (!g) return;
        const { sx, sy, ex, ey, cx, cy } = g;
        const absW = Math.min(2, Math.abs(weight));
        const lw = (1 + absW * 1.4) / view.scale;
        const color = weight >= 0
            ? `rgba(120, 200, 255, ${0.4 + 0.5 * absW / 2})`
            : `rgba(255, 140, 140, ${0.4 + 0.5 * absW / 2})`;
        ctx.strokeStyle = isSel ? '#ffffff' : color;
        ctx.fillStyle   = isSel ? '#ffffff' : color;
        ctx.lineWidth = isSel ? lw + 1.5 / view.scale : lw;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(cx, cy, ex, ey);
        ctx.stroke();
        const ahLen = 14 / view.scale;
        const ahHalf = 0.45;       // half-angle of the wedge — wider = chunkier
        const ang = Math.atan2(ey - cy, ex - cx);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - ahLen * Math.cos(ang - ahHalf), ey - ahLen * Math.sin(ang - ahHalf));
        ctx.lineTo(ex - ahLen * Math.cos(ang + ahHalf), ey - ahLen * Math.sin(ang + ahHalf));
        ctx.closePath();
        ctx.fill();
        if (isSel) {
            ctx.fillStyle = '#fff';
            ctx.font = `${11 / view.scale}px monospace`;
            ctx.fillText(weight.toFixed(2), (sx + ex) / 2 + 8 / view.scale, (sy + ey) / 2 - 4 / view.scale);
        }
    }

    function drawPulses(nowMs) {
        if (!pulses.from_idx || pulses.from_idx.length === 0) return;
        const elapsed = Math.max(0, (nowMs - lastPulseRecvMs) / 1000);
        const ids = activity.ids;
        if (!ids) return;
        const r = 4 / view.scale;
        const r2 = 6 / view.scale;
        for (let k = 0; k < pulses.from_idx.length; k++) {
            const a = neuronById.get(ids[pulses.from_idx[k]]);
            const b = neuronById.get(ids[pulses.to_idx[k]]);
            if (!a || !b) continue;
            const g = synapseGeometry(a.x, a.y, b.x, b.y);
            if (!g) continue;
            let t = pulses.progress[k];
            const dur = pulses.duration[k] || 0;
            if (dur > 0) t = Math.min(1, t + elapsed / dur);
            const it = 1 - t;
            const px = it * it * g.sx + 2 * it * t * g.cx + t * t * g.ex;
            const py = it * it * g.sy + 2 * it * t * g.cy + t * t * g.ey;
            const sign = pulses.sign ? pulses.sign[k] : 1;
            const fill = sign < 0 ? '#ffb0b0' : '#fff7a0';
            const stroke = sign < 0 ? '#ff5050' : '#ff9020';
            ctx.fillStyle = sign < 0 ? 'rgba(255,80,80,0.35)' : 'rgba(255,200,80,0.35)';
            ctx.beginPath(); ctx.arc(px, py, r2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = fill;
            ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = stroke; ctx.lineWidth = 1 / view.scale;
            ctx.stroke();
        }
    }

    function isNeuronInSelection(id) {
        if (!selected) return false;
        if (selected.type === 'neuron') return selected.id === id;
        if (selected.type === 'multi')  return selected.neuronIds.has(id);
        return false;
    }

    function drawNeuron(n, dtMs) {
        const aIdx = activityIndex.get(n.id);
        const v = aIdx !== undefined ? (activity.potentials[aIdx] ?? 0) : 0;
        const spikes = aIdx !== undefined ? (activity.spike_counts[aIdx] ?? 0) : 0;
        if (spikes > 0) spikeFlash.set(n.id, 250);
        else if (spikeFlash.has(n.id)) {
            const left = Math.max(0, spikeFlash.get(n.id) - dtMs);
            if (left <= 0) spikeFlash.delete(n.id);
            else spikeFlash.set(n.id, left);
        }
        const flash = (spikeFlash.get(n.id) || 0) / 250;

        const rgb = KIND_RGB[n.kind] || KIND_RGB.inter;
        const act = Math.max(0, Math.min(1, v));
        const negV = Math.max(0, Math.min(1, -v)); // how inhibited (0..1 range)

        if (flash > 0) {
            ctx.fillStyle = `rgba(255, 240, 120, ${flash * 0.55})`;
            ctx.beginPath(); ctx.arc(n.x, n.y, NODE_R * 1.7, 0, Math.PI * 2); ctx.fill();
        }
        let k = Math.max(0.18, act * 0.85 + flash * 0.15);
        // When inhibited, blend toward a dark blue tint to visualize negative potential
        let rr = Math.round(rgb.r * k);
        let gg = Math.round(rgb.g * k);
        let bb = Math.round(rgb.b * k);
        if (negV > 0) {
            const inhib = negV * 0.7; // strength of inhibition tint
            rr = Math.round(rr * (1 - inhib));
            gg = Math.round(gg * (1 - inhib));
            bb = Math.round(Math.min(255, bb * (1 - inhib * 0.3) + 80 * inhib));
        }
        ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
        ctx.beginPath(); ctx.arc(n.x, n.y, NODE_R, 0, Math.PI * 2); ctx.fill();

        const isSel = isNeuronInSelection(n.id);
        const isConn = connectFrom === n.id;
        ctx.lineWidth = (isSel ? 3 : isConn ? 2.5 : 1.5) / view.scale;
        ctx.strokeStyle = isSel ? '#ffffff' : (isConn ? '#7aa0ff' : (KIND_OUTLINE[n.kind] || KIND_OUTLINE.inter));
        ctx.stroke();

        // Label ABOVE the neuron
        ctx.fillStyle = '#e8eefc';
        const fontPx = Math.max(10, 11 / Math.max(0.6, view.scale));
        ctx.font = `600 ${fontPx}px -apple-system, "Segoe UI", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(n.label, n.x, n.y - NODE_R - 4 / view.scale);

        // Kind hint under default neurons
        if (defaultIds.has(n.id)) {
            ctx.font = `${9 / Math.max(0.6, view.scale)}px monospace`;
            ctx.fillStyle = '#9aa6c0';
            ctx.textBaseline = 'top';
            ctx.fillText(n.kind, n.x, n.y + NODE_R + 4 / view.scale);
        }
    }

    function hexToRgb(hex) {
        const h = (hex || '#000000').replace('#', '');
        const n = parseInt(h.length === 3
            ? h[0]+h[0]+h[1]+h[1]+h[2]+h[2] : h, 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }

    function loop() { draw(); requestAnimationFrame(loop); }
    requestAnimationFrame(loop);

    // ----------------------------------------------------------- public API
    window.editorView = {
        setTopology(top, defaults) {
            topology = top || { neurons: [], synapses: [], groups: [] };
            topology.groups = topology.groups || [];
            defaultIds = new Set(defaults || []);
            neuronById = new Map();
            for (const n of topology.neurons) {
                // During a multi-drag commit, some neurons have already been
                // moved locally but the server hasn't processed them yet.
                // Preserve the intended final positions so they aren't
                // overwritten by stale server data.
                if (pendingMultiDragPositions && pendingMultiDragPositions.has(n.id)) {
                    const pos = pendingMultiDragPositions.get(n.id);
                    n.x = pos.x;
                    n.y = pos.y;
                }
                // During a live multi-drag (before mouseup), recompute
                // positions from original coords + current mouse offset so
                // that incoming topology updates don't snap neurons back.
                if (dragging && dragging.mode === 'multi' && dragging.origs && dragging.origs.has(n.id)) {
                    const [ox, oy] = dragging.origs.get(n.id);
                    const dx = lastMouseWorld.x - dragging.startX;
                    const dy = lastMouseWorld.y - dragging.startY;
                    n.x = ox + dx;
                    n.y = oy + dy;
                }
                neuronById.set(n.id, n);
            }
            synapseByKey = new Map();
            for (const s of topology.synapses) synapseByKey.set(synapseKey(s.from, s.to), s);
            groupById = new Map();
            for (const g of topology.groups) groupById.set(g.id, g);
            // Refresh selection from authoritative topology
            if (!selected) return;
            if (selected.type === 'neuron') {
                const n = neuronById.get(selected.id);
                if (n) selectNeuron(n); else clearSelection();
            } else if (selected.type === 'synapse') {
                const s = synapseByKey.get(synapseKey(selected.from, selected.to));
                if (s) selectSynapse(s); else clearSelection();
            } else if (selected.type === 'group') {
                const g = groupById.get(selected.id);
                if (g) selectGroup(g); else clearSelection();
            } else if (selected.type === 'multi') {
                const filtered = new Set();
                for (const id of selected.neuronIds) {
                    if (neuronById.has(id)) filtered.add(id);
                }
                if (filtered.size === 0) clearSelection();
                else if (filtered.size === 1) selectNeuron(neuronById.get([...filtered][0]));
                else setMultiSelection(filtered);
            }
        },
        setActivity(act) {
            activity = act || { potentials: [], spike_counts: [], ids: [] };
            activityIndex.clear();
            const ids = activity.ids;
            if (ids) for (let i = 0; i < ids.length; i++) activityIndex.set(ids[i], i);
            // Update current V in properties panel if a neuron is selected
            if (selected && selected.type === 'neuron') {
                const idx = activityIndex.get(selected.id);
                if (idx !== undefined && activity.raw_v) {
                    const vEl = document.getElementById('prop-n-v');
                    if (vEl) vEl.textContent = activity.raw_v[idx].toFixed(3);
                }
            }
        },
        setPulses(p) {
            pulses = p || { from_idx: [], to_idx: [], progress: [], duration: [], sign: [] };
            lastPulseRecvMs = performance.now();
        },
        currentTopology() { return topology; },
    };
})();
