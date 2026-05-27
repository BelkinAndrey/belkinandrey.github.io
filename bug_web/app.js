// Top-level UI wiring for the static (web) build. `window.appSocket` is
// already set up by sim.js, so the editor and env canvas code (which still
// calls `.emit(...)`) needs no changes.

(function () {
    'use strict';

    const socket = window.appSocket;
    let currentTask = 'BUG';
    let currentMotors = ['motor_forward', 'motor_backward', 'motor_left', 'motor_right'];

    // --- Stats hooked into the per-frame state event from sim.js -----------
    window.appUI = {
        onTopology(msg) {
            if (msg.task) currentTask = msg.task;
            if (msg.motors) currentMotors = msg.motors;
            renderTaskSelect(msg.tasks || []);
            renderManualMotors();
            updateEnvironmentChrome({ kind: currentTask === 'BUG' ? 'bug' : 'gym' });
        },
        onState(s) {
            document.getElementById('stat-time').textContent = s.t.toFixed(1);
            if (s.env) updateEnvironmentChrome(s.env);
            if (s.gym_env_hz !== undefined) updateGymHzDisplay(s.gym_env_hz);
            if (s.env && s.env.kind === 'bug' && s.env.agent) {
                const a = s.env.agent;
                document.getElementById('stat-food').textContent    = a.food_eaten;
                document.getElementById('stat-hp').textContent      = a.health.toFixed(2);
                document.getElementById('stat-hunger').textContent  = a.hunger.toFixed(2);
                document.getElementById('stat-fatigue').textContent = a.fatigue.toFixed(2);
            }
            const playBtn  = document.getElementById('btn-play');
            const pauseBtn = document.getElementById('btn-pause');
            playBtn.disabled  = !!s.running;
            pauseBtn.disabled = !s.running;
        },
    };

    function renderTaskSelect(tasks) {
        const select = document.getElementById('env-task');
        if (!select || !tasks.length) return;
        const known = Array.from(select.options).map(o => o.value).join('|');
        const incoming = tasks.map(t => t.id).join('|');
        if (known !== incoming) {
            select.innerHTML = '';
            for (const t of tasks) {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.label || t.id;
                select.appendChild(opt);
            }
        }
        select.value = currentTask;
    }

    const taskSelect = document.getElementById('env-task');
    if (taskSelect) {
        taskSelect.addEventListener('change', () => {
            socket.emit('set_task', { task: taskSelect.value });
        });
    }

    function updateEnvironmentChrome(env) {
        const isBug = env.kind === 'bug';
        document.body.classList.toggle('gym-task', !isBug);
        document.body.classList.toggle('bug-task', isBug);
    }

    // --- Top toolbar -------------------------------------------------------
    document.getElementById('btn-play').addEventListener('click',
        () => socket.emit('control', { action: 'play' }));
    document.getElementById('btn-pause').addEventListener('click',
        () => socket.emit('control', { action: 'pause' }));
    document.getElementById('btn-reset-agent').addEventListener('click',
        () => socket.emit('control', { action: 'reset_agent' }));
    document.getElementById('btn-reset-net').addEventListener('click',
        () => socket.emit('control', { action: 'reset_network' }));

    // --- Env quick clears --------------------------------------------------
    document.getElementById('env-clear-food').addEventListener('click',
        () => socket.emit('clear_objects', { kind: 'food' }));
    document.getElementById('env-clear-threat').addEventListener('click',
        () => socket.emit('clear_objects', { kind: 'threat' }));
    document.getElementById('env-clear-obs').addEventListener('click',
        () => socket.emit('clear_objects', { kind: 'obstacle' }));

    // --- Sliders -----------------------------------------------------------
    function bindSlider(id, eventName, key, valId, decimals = 2, asInt = false) {
        const slider = document.getElementById(id);
        const val = document.getElementById(valId);
        const parse = (v) => asInt ? parseInt(v, 10) : parseFloat(v);
        const fmt = (v) => asInt ? String(parseInt(v, 10)) : parseFloat(v).toFixed(decimals);
        const send = () => {
            const msg = {}; msg[key] = parse(slider.value);
            socket.emit(eventName, msg);
        };
        slider.addEventListener('input', () => {
            val.textContent = fmt(slider.value);
            send();   // direct, in-process — no throttling needed without sockets
        });
        val.textContent = fmt(slider.value);
        send();
    }
    bindSlider('food-target',   'world_params', 'food_target',         'food-target-val',   0, true);
    bindSlider('threat-target', 'world_params', 'threat_target',       'threat-target-val', 0, true);
    bindSlider('threat-life',   'world_params', 'threat_lifetime',     'threat-life-val',   0, true);
    bindSlider('hunger-rate',   'world_params', 'hunger_rate',         'hunger-rate-val',   3);
    bindSlider('fatigue-gain',  'world_params', 'fatigue_action_gain', 'fatigue-gain-val',  3);
    bindSlider('fatigue-decay', 'world_params', 'fatigue_decay',       'fatigue-decay-val', 3);
    bindSlider('gym-env-hz',    'set_gym_env_hz', 'hz',                'gym-env-hz-val',    0, true);

    function updateGymHzDisplay(hz) {
        const slider = document.getElementById('gym-env-hz');
        const val = document.getElementById('gym-env-hz-val');
        if (!slider || !val || document.activeElement === slider) return;
        slider.value = String(hz);
        val.textContent = String(hz);
    }

    bindPanelResizer('rings.web.panelSplit');

    (function bindSimHzSlider() {
        const slider = document.getElementById('sim-hz');
        const val = document.getElementById('sim-hz-val');
        slider.addEventListener('input', () => {
            val.textContent = slider.value;
            socket.emit('set_sim_hz', { hz: parseInt(slider.value, 10) });
        });
        val.textContent = slider.value;
    })();

    // --- Manual motor (buttons + WASD) ------------------------------------
    function motorLabel(motorId) {
        const key = motorId.replace(/^motor_/, '');
        const labels = {
            forward: 'Forward (W)',
            backward: 'Back (S)',
            left: 'Left (A)',
            right: 'Right (D)',
            coast: 'Coast (S)',
        };
        return labels[key] || key.replaceAll('_', ' ');
    }

    function renderManualMotors() {
        const row = document.getElementById('manual-motors');
        if (!row) return;
        const wanted = currentMotors.join('|');
        if (row.dataset.motors === wanted) return;
        row.dataset.motors = wanted;
        row.innerHTML = '';
        for (const motorId of currentMotors) {
            const key = motorId.replace(/^motor_/, '');
            const btn = document.createElement('button');
            btn.className = 'motor';
            btn.dataset.motor = key;
            btn.textContent = motorLabel(motorId);
            bindMotorButton(btn, key);
            row.appendChild(btn);
        }
    }

    function setMotor(name, on) {
        const msg = {}; msg[name] = on;
        socket.emit('manual_motor', msg);
        document.querySelectorAll(`button.motor[data-motor="${name}"]`).forEach(b => {
            b.classList.toggle('held', on);
        });
    }

    function bindMotorButton(btn, name) {
        btn.addEventListener('mousedown',  () => setMotor(name, true));
        btn.addEventListener('mouseup',    () => setMotor(name, false));
        btn.addEventListener('mouseleave', () => setMotor(name, false));
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); setMotor(name, true); });
        btn.addEventListener('touchend',   (e) => { e.preventDefault(); setMotor(name, false); });
    }

    renderManualMotors();
    const KEY_MAP = { w: ['forward'], s: ['backward', 'coast'], a: ['left'], d: ['right'] };
    const pressed = new Set();
    window.addEventListener('keydown', (e) => {
        if (e.target.matches('input, textarea, select')) return;
        const k = e.key.toLowerCase();
        const motor = motorForKey(k);
        if (motor && !pressed.has(k)) {
            pressed.add(k);
            setMotor(motor, true);
        }
    });
    window.addEventListener('keyup', (e) => {
        const k = e.key.toLowerCase();
        const motor = motorForKey(k);
        if (motor) {
            pressed.delete(k);
            setMotor(motor, false);
        }
    });

    function motorForKey(key) {
        const options = KEY_MAP[key] || [];
        for (const name of options) {
            if (currentMotors.includes(`motor_${name}`)) return name;
        }
        return null;
    }

    // --- Network: Load (bundled examples), Export, Import -----------------
    const loadDlg = document.getElementById('load-dialog');
    const loadList = document.getElementById('load-list');

    async function fetchSavedGroups() {
        try {
            const r = await fetch('saved_networks/manifest.json', { cache: 'no-store' });
            if (!r.ok) return {};
            const j = await r.json();
            if (j.groups && typeof j.groups === 'object') return j.groups;
            const groups = { BUG: [], CartPole: [], MountainCar: [] };
            const files = Array.isArray(j.files) ? j.files : [];
            await Promise.all(files.map(async (name) => {
                let task = 'BUG';
                try {
                    const res = await fetch(`saved_networks/${name}`, { cache: 'no-store' });
                    if (res.ok) {
                        const data = await res.json();
                        task = data.task || 'BUG';
                    }
                } catch (e) {
                    console.warn(`failed to inspect ${name}:`, e);
                }
                if (!groups[task]) groups[task] = [];
                groups[task].push(name);
            }));
            return groups;
        } catch (e) {
            console.warn('manifest fetch failed:', e);
            return {};
        }
    }

    async function loadBundled(name) {
        const r = await fetch(`saved_networks/${name}`, { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        socket.emit('load_network', { data });
        flash(`Loaded: ${name}`);
    }

    document.getElementById('net-load').addEventListener('click', async () => {
        loadList.innerHTML = '<li>loading…</li>';
        loadDlg.showModal();
        const groups = await fetchSavedGroups();
        loadList.innerHTML = '';
        if (!Object.values(groups).some(files => files.length)) {
            loadList.innerHTML = '<li>manifest is empty</li>';
            return;
        }
        for (const [task, files] of Object.entries(groups)) {
            if (!files.length) continue;
            const header = document.createElement('li');
            header.className = 'load-section';
            header.textContent = task;
            loadList.appendChild(header);
            for (const f of files) {
                const li = document.createElement('li');
                li.textContent = f;
                li.addEventListener('click', async () => {
                    loadDlg.close();
                    try { await loadBundled(f); }
                    catch (e) { alert(`Failed to load ${f}: ${e.message}`); }
                });
                loadList.appendChild(li);
            }
        }
    });

    // Export current topology as a downloadable JSON file
    document.getElementById('net-export').addEventListener('click', () => {
        const top = window.simEngine ? window.simEngine.getTopology()
                                     : window.editorView.currentTopology();
        const blob = new Blob([JSON.stringify(top, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'network.json';
        a.click();
        URL.revokeObjectURL(a.href);
    });

    // Import from a local file
    const importInput = document.getElementById('net-import-file');
    document.getElementById('net-import').addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', async () => {
        const f = importInput.files[0];
        if (!f) return;
        const text = await f.text();
        try {
            const data = JSON.parse(text);
            socket.emit('load_network', { data });
            flash(`Imported: ${f.name}`);
        } catch (e) {
            alert('Invalid JSON: ' + e.message);
        }
        importInput.value = '';
    });

    function flash(text) {
        const el = document.createElement('div');
        el.textContent = text;
        Object.assign(el.style, {
            position: 'fixed', top: '70px', right: '20px',
            background: '#3a5cff', color: '#fff',
            padding: '8px 14px', borderRadius: '4px', zIndex: 9999,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        });
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1800);
    }

    function bindPanelResizer(storageKey) {
        const layout = document.querySelector('.layout');
        const resizer = document.getElementById('main-panel-resizer');
        if (!layout || !resizer) return;

        const saved = parseFloat(localStorage.getItem(storageKey));
        if (Number.isFinite(saved)) setSplit(saved);

        function setSplit(percent) {
            const clamped = Math.min(72, Math.max(28, percent));
            layout.style.setProperty('--env-panel-width', `${clamped}%`);
            window.dispatchEvent(new Event('resize'));
            return clamped;
        }

        function setFromClientX(clientX) {
            const rect = layout.getBoundingClientRect();
            const raw = ((clientX - rect.left) / rect.width) * 100;
            const split = setSplit(raw);
            localStorage.setItem(storageKey, String(split));
        }

        resizer.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            resizer.setPointerCapture(e.pointerId);
            document.body.classList.add('resizing-panels');
        });
        resizer.addEventListener('pointermove', (e) => {
            if (!resizer.hasPointerCapture(e.pointerId)) return;
            setFromClientX(e.clientX);
        });
        resizer.addEventListener('pointerup', (e) => {
            if (resizer.hasPointerCapture(e.pointerId)) resizer.releasePointerCapture(e.pointerId);
            document.body.classList.remove('resizing-panels');
        });
        resizer.addEventListener('pointercancel', (e) => {
            if (resizer.hasPointerCapture(e.pointerId)) resizer.releasePointerCapture(e.pointerId);
            document.body.classList.remove('resizing-panels');
        });
        resizer.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            const current = parseFloat(getComputedStyle(layout).getPropertyValue('--env-panel-width')) || 48;
            const split = setSplit(current + (e.key === 'ArrowLeft' ? -2 : 2));
            localStorage.setItem(storageKey, String(split));
        });
    }

    // --- Start the simulation loop now that everything is wired -----------
    window.simEngine.startLoop();
})();
