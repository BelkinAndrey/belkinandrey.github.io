// Environment canvas: bug agent, food, threats, obstacles. Pan/zoom + responsive.

(function () {
    const canvas = document.getElementById('env-canvas');
    const ctx = canvas.getContext('2d');
    const wrap = canvas.parentElement;
    const toolGroup = document.getElementById('env-tool-group');
    const resetViewBtn = document.getElementById('env-reset-view');

    let currentTool = 'select';
    let state = null;
    let dragObstacle = null;
    let panning = null;

    const view = { scale: 1, tx: 0, ty: 0 };
    const MIN_SCALE = 0.25, MAX_SCALE = 6;

    toolGroup.addEventListener('click', (e) => {
        const b = e.target.closest('.tool-btn');
        if (!b) return;
        currentTool = b.dataset.tool;
        toolGroup.querySelectorAll('.tool-btn').forEach(x => x.classList.toggle('active', x === b));
    });
    resetViewBtn.addEventListener('click', () => {
        view.scale = 1; view.tx = 0; view.ty = 0;
    });

    // Arena dimensions are fixed (set in HTML's <canvas width/height>).
    // The env panel may scroll around the canvas; we don't resize the world.

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

    function findObjectAt(w) {
        if (!state) return null;
        for (const f of state.foods) {
            if ((f.x - w.x) ** 2 + (f.y - w.y) ** 2 < (f.size + 2) ** 2) {
                return { kind: 'food', id: f.id };
            }
        }
        for (const t of state.threats) {
            if ((t.x - w.x) ** 2 + (t.y - w.y) ** 2 < (t.radius + 2) ** 2) {
                return { kind: 'threat', id: t.id };
            }
        }
        for (const o of state.obstacles) {
            if (w.x >= o.x && w.x <= o.x + o.w && w.y >= o.y && w.y <= o.y + o.h) {
                return { kind: 'obstacle', id: o.id };
            }
        }
        return null;
    }

    canvas.addEventListener('mousedown', (e) => {
        if (!state) return;
        if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
            const m = mouseScreen(e);
            panning = { sx: m.x, sy: m.y, tx: view.tx, ty: view.ty };
            e.preventDefault(); return;
        }
        if (e.button !== 0) return;
        const w = mouseWorld(e);
        if (currentTool === 'obstacle') { dragObstacle = { x0: w.x, y0: w.y, x: w.x, y: w.y }; return; }
        if (currentTool === 'erase') {
            const hit = findObjectAt(w);
            if (hit) window.appSocket.emit('remove_object', hit);
            return;
        }
        if (currentTool === 'food' || currentTool === 'threat') {
            window.appSocket.emit('place_object', { kind: currentTool, x: w.x, y: w.y });
            return;
        }
        if (currentTool === 'agent') {
            window.appSocket.emit('place_object', { kind: 'agent', x: w.x, y: w.y });
            return;
        }
    });
    canvas.addEventListener('mousemove', (e) => {
        if (panning) {
            const m = mouseScreen(e);
            view.tx = panning.tx + (m.x - panning.sx);
            view.ty = panning.ty + (m.y - panning.sy);
            return;
        }
        if (dragObstacle) { const w = mouseWorld(e); dragObstacle.x = w.x; dragObstacle.y = w.y; }
    });
    function endActions(e) {
        if (panning) { panning = null; return; }
        if (dragObstacle) {
            const w = mouseWorld(e);
            const x0 = Math.min(dragObstacle.x0, w.x);
            const y0 = Math.min(dragObstacle.y0, w.y);
            const ww = Math.max(8, Math.abs(w.x - dragObstacle.x0));
            const hh = Math.max(8, Math.abs(w.y - dragObstacle.y0));
            window.appSocket.emit('place_object', {
                kind: 'obstacle', x: x0 + ww / 2, y: y0 + hh / 2, w: ww, h: hh,
            });
            dragObstacle = null;
        }
    }
    canvas.addEventListener('mouseup', endActions);
    canvas.addEventListener('mouseleave', endActions);

    // -------------------------------------------------------- sector helpers
    function inArc(angle, arc) {
        const [a, b] = arc;
        if (a <= b) return angle >= a && angle <= b;
        return angle >= a || angle <= b;
    }

    // ----------------------------------------------------------- rendering

    function draw() {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#0a0d14';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.setTransform(view.scale, 0, 0, view.scale, view.tx, view.ty);

        if (state) {
            ctx.strokeStyle = '#141a26';
            ctx.lineWidth = 1 / view.scale;
            const W = state.width, H = state.height;
            ctx.beginPath();
            for (let x = 0; x <= W; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
            for (let y = 0; y <= H; y += 40) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
            ctx.stroke();
            ctx.strokeStyle = '#2a3447';
            ctx.lineWidth = 2 / view.scale;
            ctx.strokeRect(0, 0, W, H);

            for (const o of state.obstacles) {
                ctx.fillStyle = '#39455e'; ctx.fillRect(o.x, o.y, o.w, o.h);
                ctx.strokeStyle = '#5b6a8a'; ctx.lineWidth = 1 / view.scale;
                ctx.strokeRect(o.x + 0.5 / view.scale, o.y + 0.5 / view.scale,
                               o.w - 1 / view.scale, o.h - 1 / view.scale);
            }
            for (const f of state.foods) {
                ctx.fillStyle = '#9be37c';
                ctx.beginPath(); ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#3a6a23'; ctx.lineWidth = 1 / view.scale; ctx.stroke();
            }
            const pulse = 0.7 + 0.3 * Math.sin(performance.now() / 200);
            for (const t of state.threats) {
                ctx.fillStyle = `rgba(255,90,90,${0.25 * pulse})`;
                ctx.beginPath(); ctx.arc(t.x, t.y, t.radius * 1.8, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#ff5050';
                ctx.beginPath(); ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#3a0a0a'; ctx.lineWidth = 1 / view.scale; ctx.stroke();
            }

            drawAgent(state.agent, state.sensor_arcs);
        }

        if (dragObstacle) {
            const x = Math.min(dragObstacle.x0, dragObstacle.x);
            const y = Math.min(dragObstacle.y0, dragObstacle.y);
            const w = Math.abs(dragObstacle.x - dragObstacle.x0);
            const h = Math.abs(dragObstacle.y - dragObstacle.y0);
            ctx.strokeStyle = '#7aa0ff'; ctx.lineWidth = 1.5 / view.scale;
            ctx.setLineDash([4 / view.scale, 3 / view.scale]);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);
        }

        // HUD overlay (screen-space)
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        drawHud();

        requestAnimationFrame(draw);
    }

    function drawAgent(a, arcs) {
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.heading);

        const lw = 1 / view.scale;

        // Sensor sectors (drawn before body, faint)
        if (arcs) {
            // Food sensors — green tint
            const rFood = a.radius * 8;
            drawSector(rFood, arcs.food_left,
                       'rgba(90,200,120,0.05)', 'rgba(90,200,120,0.30)', lw);
            drawSector(rFood, arcs.food_right,
                       'rgba(90,200,120,0.05)', 'rgba(90,200,120,0.30)', lw);
            // Threat sensors — red tint, wider radius
            const rTh = a.radius * 9;
            drawSector(rTh, arcs.threat_left,
                       'rgba(255,90,90,0.05)', 'rgba(255,90,90,0.25)', lw);
            drawSector(rTh, arcs.threat_right,
                       'rgba(255,90,90,0.05)', 'rgba(255,90,90,0.25)', lw);
        }

        // Lidars
        for (let i = 0; i < a.lidar_angles.length; i++) {
            const ang = a.lidar_angles[i];
            const d = a.lidar_distances[i];
            const prox = 1.0 - d / a.lidar_range;
            ctx.strokeStyle = `rgba(140, 200, 255, ${0.2 + 0.7 * prox})`;
            ctx.lineWidth = lw;
            ctx.beginPath(); ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(ang) * d, Math.sin(ang) * d);
            ctx.stroke();
            ctx.fillStyle = prox > 0.05
                ? `rgba(255,170,100,${0.4 + prox * 0.6})`
                : 'rgba(140,200,255,0.4)';
            ctx.beginPath();
            ctx.arc(Math.cos(ang) * d, Math.sin(ang) * d, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Body
        ctx.fillStyle = '#ffd87a';
        ctx.strokeStyle = '#2a2010';
        ctx.lineWidth = 1.5 * lw;
        ctx.beginPath();
        ctx.ellipse(0, 0, a.radius * 1.4, a.radius, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        // Head accent
        ctx.fillStyle = '#c98e2a';
        ctx.beginPath();
        ctx.ellipse(a.radius * 0.7, 0, a.radius * 0.5, a.radius * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();

        // Heading marker
        ctx.strokeStyle = '#2a2010'; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(a.radius * 1.4, 0); ctx.stroke();

        // Sensor markers — small dots at sector centers, brightness = signal
        if (arcs) {
            drawSensorDot(arcs.food_left,   a.radius * 1.4, '#9be37c', a.food_left);
            drawSensorDot(arcs.food_right,  a.radius * 1.4, '#9be37c', a.food_right);
            drawSensorDot(arcs.threat_left,  a.radius * 1.6, '#ff5050', a.threat_left);
            drawSensorDot(arcs.threat_right, a.radius * 1.6, '#ff5050', a.threat_right);
        }

        ctx.restore();
    }

    function drawSector(r, arc, fill, stroke, lw) {
        const [a, b] = arc;
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, r, a, b);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
    }

    function drawSensorDot(arc, dist, baseColor, signal) {
        const [a, b] = arc;
        const mid = (a + b) / 2;
        const x = Math.cos(mid) * dist;
        const y = Math.sin(mid) * dist;
        const k = Math.min(1, signal / 4);
        ctx.fillStyle = baseColor;
        ctx.globalAlpha = 0.35 + 0.65 * k;
        ctx.beginPath(); ctx.arc(x, y, 4 / view.scale, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#1a1410'; ctx.lineWidth = 1 / view.scale; ctx.stroke();
    }

    // ----------------------------------------------------------- HUD bars

    function drawHud() {
        if (!state) return;
        const a = state.agent;
        ctx.font = '11px -apple-system, "Segoe UI", monospace';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';

        // Hint top-left
        ctx.fillStyle = 'rgba(180, 200, 255, 0.45)';
        ctx.fillText(`zoom ${view.scale.toFixed(2)}× · wheel=zoom · Shift+drag=pan`, 10, 14);

        const x0 = 10, y0 = 36, w = 160, h = 12, gap = 6;
        drawBar(x0, y0,                  w, h, a.health,  '#6ad06a', '#1f3a1f', 'HP');
        drawBar(x0, y0 + (h + gap),      w, h, a.hunger,  '#ffb14a', '#3a2a16', 'hunger');
        drawBar(x0, y0 + 2 * (h + gap),  w, h, a.fatigue, '#b681e7', '#2a1d3a', 'fatigue');
    }

    function drawBar(x, y, w, h, frac, fg, bg, label) {
        ctx.fillStyle = bg;
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = fg;
        ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        ctx.fillStyle = '#e8eefc';
        ctx.fillText(`${label} ${(frac * 100).toFixed(0)}%`, x + w + 8, y + h / 2);
    }

    window.envView = {
        update(envSnap) { state = envSnap; },
    };

    requestAnimationFrame(draw);
})();
