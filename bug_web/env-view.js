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
        if (state.kind !== 'bug') return;
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
        if (!state || state.kind !== 'bug') { dragObstacle = null; return; }
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
            if (state.kind === 'gym') {
                drawGymState(state);
            } else {
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

    function drawGymState(s) {
        const task = gymTaskKey(s);
        if (task === 'cartpole') renderCartPole(s);
        else if (task === 'mountain_car') renderMountainCar(s);
    }

    function gymTaskKey(s) {
        if (s.task) return s.task;
        if (s.task_id === 'CartPole') return 'cartpole';
        if (s.task_id === 'MountainCar') return 'mountain_car';
        return '';
    }

    function renderCartPole(s) {
        const W = s.width || 1100, H = s.height || 700;
        const obs = s.observation || [0, 0, 0, 0];
        const x = s.x ?? obs[0] ?? 0;
        const theta = s.theta ?? obs[2] ?? 0;
        const xLimit = s.x_limit || 2.4;
        const poleHalfLen = s.pole_half_len || 0.5;
        const forceDir = s.force_dir ?? ((s.action === 0) ? -1 : 1);
        const groundY = H * 0.72;
        const pxPerUnit = (W * 0.40) / xLimit;
        const cxWorld = W / 2 + x * pxPerUnit;

        ctx.setTransform(view.scale, 0, 0, view.scale, view.tx, view.ty);
        ctx.strokeStyle = '#2a3447'; ctx.lineWidth = 2 / view.scale;
        ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(W, groundY); ctx.stroke();

        const lx = W / 2 - xLimit * pxPerUnit;
        const rx = W / 2 + xLimit * pxPerUnit;
        ctx.strokeStyle = '#5b6a8a';
        ctx.setLineDash([6 / view.scale, 6 / view.scale]);
        ctx.beginPath();
        ctx.moveTo(lx, groundY - 80); ctx.lineTo(lx, groundY + 20);
        ctx.moveTo(rx, groundY - 80); ctx.lineTo(rx, groundY + 20);
        ctx.stroke();
        ctx.setLineDash([]);

        const cartW = 90, cartH = 36;
        ctx.fillStyle = s.done ? '#a85050' : '#3a5cff';
        ctx.fillRect(cxWorld - cartW / 2, groundY - cartH, cartW, cartH);
        ctx.strokeStyle = '#0a0d14'; ctx.lineWidth = 2 / view.scale;
        ctx.strokeRect(cxWorld - cartW / 2, groundY - cartH, cartW, cartH);
        ctx.fillStyle = '#202836';
        ctx.beginPath(); ctx.arc(cxWorld - cartW / 3, groundY - 4, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cxWorld + cartW / 3, groundY - 4, 6, 0, Math.PI * 2); ctx.fill();

        const poleLen = poleHalfLen * 2 * pxPerUnit;
        const px = cxWorld + Math.sin(theta) * poleLen;
        const py = groundY - cartH - Math.cos(theta) * poleLen;
        ctx.strokeStyle = s.done ? '#ff8a8a' : '#ffd87a';
        ctx.lineWidth = 8 / view.scale; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cxWorld, groundY - cartH); ctx.lineTo(px, py); ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.fillStyle = '#ffd87a';
        ctx.beginPath(); ctx.arc(cxWorld, groundY - cartH, 5, 0, Math.PI * 2); ctx.fill();

        if (forceDir !== 0) {
            const ax = cxWorld + forceDir * 35;
            ctx.strokeStyle = '#ffaa55'; ctx.lineWidth = 3 / view.scale;
            ctx.beginPath();
            ctx.moveTo(cxWorld, groundY - cartH / 2);
            ctx.lineTo(ax, groundY - cartH / 2);
            const ah = 6;
            ctx.moveTo(ax, groundY - cartH / 2);
            ctx.lineTo(ax - forceDir * ah, groundY - cartH / 2 - ah / 2);
            ctx.moveTo(ax, groundY - cartH / 2);
            ctx.lineTo(ax - forceDir * ah, groundY - cartH / 2 + ah / 2);
            ctx.stroke();
        }
    }

    function hillY(xSim, W, H) {
        const groundY = H * 0.80;
        const topY = H * 0.15;
        const hillH = groundY - topY;
        return groundY - (Math.sin(3 * xSim) * 0.45 + 0.55) * hillH;
    }

    function renderMountainCar(s) {
        const W = s.width || 1100, H = s.height || 700;
        const obs = s.observation || [-0.5, 0];
        const pos = s.pos ?? obs[0] ?? -0.5;
        const minPos = s.min_pos ?? -1.2;
        const maxPos = s.max_pos ?? 0.6;
        const goalPos = s.goal_pos ?? 0.5;
        const action = s.action ?? 0;
        ctx.setTransform(view.scale, 0, 0, view.scale, view.tx, view.ty);

        const xMargin = W * 0.06;
        const xWorldRange = maxPos - minPos;
        const pxPerUnit = (W - 2 * xMargin) / xWorldRange;
        function simToScreenX(x) { return xMargin + (x - minPos) * pxPerUnit; }

        ctx.fillStyle = '#1a2233';
        ctx.beginPath();
        const N = 200;
        for (let i = 0; i <= N; i++) {
            const xSim = minPos + (i / N) * xWorldRange;
            const sx = simToScreenX(xSim);
            const sy = hillY(xSim, W, H);
            if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        ctx.lineTo(simToScreenX(maxPos), H);
        ctx.lineTo(simToScreenX(minPos), H);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#3a4a66'; ctx.lineWidth = 2 / view.scale;
        ctx.beginPath();
        for (let i = 0; i <= N; i++) {
            const xSim = minPos + (i / N) * xWorldRange;
            const sx = simToScreenX(xSim);
            const sy = hillY(xSim, W, H);
            if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        ctx.stroke();

        const gx = simToScreenX(goalPos);
        const gy = hillY(goalPos, W, H);
        ctx.strokeStyle = '#e0e6f5'; ctx.lineWidth = 2 / view.scale;
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx, gy - 36); ctx.stroke();
        ctx.fillStyle = s.solved ? '#9be37c' : '#ffd87a';
        ctx.beginPath();
        ctx.moveTo(gx, gy - 36); ctx.lineTo(gx + 18, gy - 30);
        ctx.lineTo(gx, gy - 24); ctx.closePath(); ctx.fill();

        const carX = simToScreenX(pos);
        const carY = hillY(pos, W, H);
        const eps = 0.01;
        const slope = (hillY(pos + eps, W, H) - hillY(pos - eps, W, H)) /
            ((simToScreenX(pos + eps) - simToScreenX(pos - eps)) || 1);
        const ang = Math.atan(slope);
        ctx.save();
        ctx.translate(carX, carY);
        ctx.rotate(ang);
        ctx.fillStyle = '#3a5cff';
        ctx.fillRect(-18, -16, 36, 12);
        ctx.fillStyle = '#5b75d6';
        ctx.fillRect(-12, -24, 24, 10);
        ctx.fillStyle = '#202836';
        ctx.beginPath(); ctx.arc(-12, -2, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(12, -2, 5, 0, Math.PI * 2); ctx.fill();
        if (action !== 0) {
            ctx.strokeStyle = '#ffaa55'; ctx.lineWidth = 2 / view.scale;
            ctx.beginPath();
            ctx.moveTo(0, -28); ctx.lineTo(action * 16, -28);
            const ah = 5; const sx = action * 16;
            ctx.moveTo(sx, -28); ctx.lineTo(sx - action * ah, -28 - ah / 2);
            ctx.moveTo(sx, -28); ctx.lineTo(sx - action * ah, -28 + ah / 2);
            ctx.stroke();
        }
        ctx.restore();
    }

    // ----------------------------------------------------------- HUD bars

    function drawHud() {
        if (!state) return;
        ctx.font = '11px -apple-system, "Segoe UI", monospace';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';

        // Hint top-left
        ctx.fillStyle = 'rgba(180, 200, 255, 0.45)';
        ctx.fillText(`zoom ${view.scale.toFixed(2)}× · wheel=zoom · Shift+drag=pan`, 10, 14);

        if (state.kind !== 'gym') {
            const a = state.agent;
        const x0 = 10, y0 = 36, w = 160, h = 12, gap = 6;
        drawBar(x0, y0,                  w, h, a.health,  '#6ad06a', '#1f3a1f', 'HP');
        drawBar(x0, y0 + (h + gap),      w, h, a.hunger,  '#ffb14a', '#3a2a16', 'hunger');
        drawBar(x0, y0 + 2 * (h + gap),  w, h, a.fatigue, '#b681e7', '#2a1d3a', 'fatigue');
            return;
        }

        const task = gymTaskKey(state);
        if (task === 'cartpole') {
            drawHudLines([
                `steps: ${state.steps ?? state.episode_steps ?? 0}`,
                `episode: ${state.episode ?? state.episode_index ?? 0}`,
                `last: ${state.last_episode_steps ?? 0}`,
                `best: ${state.best_steps ?? 0}`,
                `reward sensor: ${Number(state.reward_signal ?? 0).toFixed(2)}`,
                state.done ? doneReasonText(state.done_reason) : '',
            ], '#9bcaff');
        } else if (task === 'mountain_car') {
            const best = state.best_steps && state.best_steps > 0 ? state.best_steps : 'not solved';
            drawHudLines([
                `steps: ${state.steps ?? state.episode_steps ?? 0}`,
                `episode: ${state.episode ?? state.episode_index ?? 0}`,
                `last: ${state.last_episode_steps ?? 0}`,
                `best: ${best}`,
                `reward sensor: ${Number(state.reward_signal ?? 0).toFixed(2)} · action: ${state.action_name || state.action}`,
                state.solved ? doneReasonText('goal') : (state.done ? doneReasonText(state.done_reason) : ''),
            ], '#9bcaff');
        }
    }

    function doneReasonText(reason) {
        if (reason === 'goal') return '— goal! —';
        if (reason === 'time limit') return '— time limit —';
        if (reason === 'fallen') return '— fallen —';
        if (reason === 'terminated') return '— done —';
        return reason ? `— ${reason} —` : '— done —';
    }

    function drawHudLines(lines, color) {
        let y = 36;
        ctx.fillStyle = color;
        for (const line of lines) {
            if (!line) continue;
            ctx.fillText(line, 10, y);
            y += 16;
        }
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
