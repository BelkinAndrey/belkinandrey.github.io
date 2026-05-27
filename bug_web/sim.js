// Stand-alone simulation engine (browser-only). Ports snn.py + environment.py
// + app.py background loop to JavaScript so the whole project runs as static
// files (e.g. on GitHub Pages) — no Python server required.
//
// Exposes a global `appSocket` (alias `appBus`) with the same `.emit(event, msg)`
// interface that the original socket.io client used, so editor.js / env-view.js
// can stay untouched.

(function () {
    'use strict';

    // ============================================================ helpers

    const PI = Math.PI;
    const TAU = 2 * PI;
    function wrapPi(a) {
        while (a > PI)  a -= TAU;
        while (a < -PI) a += TAU;
        return a;
    }
    // Box–Muller (one-sample) Gaussian.
    function gaussian() {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    function clamp(x, lo, hi) {
        return Math.max(lo, Math.min(hi, x));
    }
    function uniform(lo, hi) {
        return lo + Math.random() * (hi - lo);
    }
    function preservedKindsMap(nid) {
        if (nid.startsWith('sensor_') || nid.startsWith('lidar_')) return 'sensor';
        if (nid.startsWith('motor_')) return 'motor';
        return 'inter';
    }

    // ============================================================ SpikingNetwork

    class SpikingNetwork {
        constructor(capacity = 512) {
            this.capacity = capacity;
            this.MAX_DELAY = 64;
            this.MAX_PULSES = 8192;
            this.n = 0;
            this.ids = [];
            this.idToIdx = new Map();
            this.meta = {};
            this.groups = [];

            // LIF state (TypedArrays for cache-friendly inner loop)
            this.V                = new Float32Array(capacity);
            this.threshold        = new Float32Array(capacity);
            this.leak             = new Float32Array(capacity);
            this.vReset           = new Float32Array(capacity);
            this.vMin             = new Float32Array(capacity).fill(-100.0);
            this.noiseStd         = new Float32Array(capacity);
            this.refractoryLeft   = new Int32Array(capacity);
            this.refractoryPeriod = new Int32Array(capacity);
            this.spikes           = new Uint8Array(capacity);
            this.spikeCount       = new Int32Array(capacity);
            // Defaults
            for (let i = 0; i < capacity; i++) {
                this.threshold[i] = 1.0;
                this.leak[i] = 0.08;
                this.vMin[i] = -100.0;
                this.refractoryPeriod[i] = 2;
            }

            // Connectivity stored as a flat row-major matrix:
            //   W[i*cap + j]            = weight to neuron i from j
            //   delaySteps[i*cap + j]   = delay in steps for that synapse
            this.W = new Float32Array(capacity * capacity);
            this.delaySteps = new Int16Array(capacity * capacity);
            this.delaySteps.fill(1);

            // Active pulses ("axons currently carrying a spike")
            this.pulseFrom   = new Int32Array(this.MAX_PULSES);
            this.pulseTo     = new Int32Array(this.MAX_PULSES);
            this.pulseAge    = new Int32Array(this.MAX_PULSES);
            this.pulseDelay  = new Int32Array(this.MAX_PULSES);
            this.pulseWeight = new Float32Array(this.MAX_PULSES);
            this.pulseDelay.fill(1);
            this.pulseCount = 0;
        }

        // -------------------------------------------------- topology mutators

        addNeuron(nid, opts = {}) {
            if (this.idToIdx.has(nid)) throw new Error(`neuron ${nid} already exists`);
            if (this.n >= this.capacity) throw new Error('network capacity reached');
            const idx = this.n;
            this.ids.push(nid);
            this.idToIdx.set(nid, idx);
            this.meta[nid] = {
                label: opts.label ?? nid,
                kind:  opts.kind  ?? 'inter',
                x:     +(opts.x ?? 0),
                y:     +(opts.y ?? 0),
            };
            this.threshold[idx]        = opts.threshold ?? 1.0;
            this.leak[idx]             = opts.leak ?? 0.08;
            this.vReset[idx]           = opts.v_reset ?? 0.0;
            this.vMin[idx]             = opts.v_min ?? -100.0;
            this.refractoryPeriod[idx] = Math.max(0, opts.refractory ?? 2);
            this.noiseStd[idx]         = Math.max(0, opts.noise_std ?? 0);
            this.V[idx] = 0;
            this.refractoryLeft[idx] = 0;
            this.spikes[idx] = 0;
            this.spikeCount[idx] = 0;
            this.n++;
            this.invalidatePulses();
            return idx;
        }

        removeNeuron(nid) {
            if (!this.idToIdx.has(nid)) return;
            const kind = this.meta[nid].kind;
            if (kind === 'sensor' || kind === 'motor') {
                throw new Error('cannot remove default sensor/motor neuron');
            }
            const idx = this.idToIdx.get(nid);
            const last = this.n - 1;
            if (idx !== last) this._swap(idx, last);
            this._clearSlot(last);
            const lastId = this.ids.pop();
            this.idToIdx.delete(lastId);
            delete this.meta[lastId];
            this.n--;
            this.invalidatePulses();
        }

        _swap(a, b) {
            if (a === b) return;
            const scalarArrs = [
                this.V, this.threshold, this.leak, this.vReset, this.vMin,
                this.noiseStd, this.refractoryLeft, this.refractoryPeriod,
                this.spikes, this.spikeCount,
            ];
            for (const arr of scalarArrs) { const t = arr[a]; arr[a] = arr[b]; arr[b] = t; }
            const cap = this.capacity;
            // Swap rows a and b
            for (let j = 0; j < cap; j++) {
                let t = this.W[a*cap + j]; this.W[a*cap + j] = this.W[b*cap + j]; this.W[b*cap + j] = t;
                t = this.delaySteps[a*cap + j]; this.delaySteps[a*cap + j] = this.delaySteps[b*cap + j]; this.delaySteps[b*cap + j] = t;
            }
            // Swap columns a and b
            for (let i = 0; i < cap; i++) {
                let t = this.W[i*cap + a]; this.W[i*cap + a] = this.W[i*cap + b]; this.W[i*cap + b] = t;
                t = this.delaySteps[i*cap + a]; this.delaySteps[i*cap + a] = this.delaySteps[i*cap + b]; this.delaySteps[i*cap + b] = t;
            }
            const idA = this.ids[a], idB = this.ids[b];
            this.ids[a] = idB; this.ids[b] = idA;
            this.idToIdx.set(idA, b);
            this.idToIdx.set(idB, a);
        }

        _clearSlot(idx) {
            this.V[idx] = 0;
            this.threshold[idx] = 1.0;
            this.leak[idx] = 0.08;
            this.vReset[idx] = 0;
            this.vMin[idx] = -100.0;
            this.noiseStd[idx] = 0;
            this.refractoryLeft[idx] = 0;
            this.refractoryPeriod[idx] = 2;
            this.spikes[idx] = 0;
            this.spikeCount[idx] = 0;
            const cap = this.capacity;
            for (let j = 0; j < cap; j++) {
                this.W[idx*cap + j] = 0;
                this.W[j*cap + idx] = 0;
                this.delaySteps[idx*cap + j] = 1;
                this.delaySteps[j*cap + idx] = 1;
            }
        }

        addSynapse(fromId, toId, weight, delay = 1) {
            const i = this.idToIdx.get(toId);
            const j = this.idToIdx.get(fromId);
            if (i === undefined || j === undefined) return;
            this.W[i*this.capacity + j] = +weight;
            this.delaySteps[i*this.capacity + j] = Math.max(1, Math.min(this.MAX_DELAY, +delay | 0));
            this.invalidatePulses();
        }

        removeSynapse(fromId, toId) {
            const i = this.idToIdx.get(toId);
            const j = this.idToIdx.get(fromId);
            if (i === undefined || j === undefined) return;
            this.W[i*this.capacity + j] = 0;
            this.delaySteps[i*this.capacity + j] = 1;
            this.invalidatePulses();
        }

        updateNeuron(nid, params) {
            if (!this.idToIdx.has(nid)) return;
            const idx = this.idToIdx.get(nid);
            if ('threshold'  in params) this.threshold[idx] = +params.threshold;
            if ('leak'       in params) this.leak[idx] = +params.leak;
            if ('v_reset'    in params) this.vReset[idx] = +params.v_reset;
            if ('v_min'      in params) this.vMin[idx] = +params.v_min;
            if ('refractory' in params) this.refractoryPeriod[idx] = Math.max(0, +params.refractory | 0);
            if ('noise_std'  in params) this.noiseStd[idx] = Math.max(0, +params.noise_std);
            if ('label' in params) this.meta[nid].label = String(params.label);
            if ('x' in params) this.meta[nid].x = +params.x;
            if ('y' in params) this.meta[nid].y = +params.y;
        }

        // Visual groups (not part of simulation)
        addGroup(gid, x, y, w, h, label = '', color = '#3a5cff', comment = '') {
            const g = {
                id: gid, x: +x, y: +y, w: +w, h: +h,
                label: String(label), color: String(color), comment: String(comment),
            };
            this.groups.push(g);
            return g;
        }
        updateGroup(gid, params) {
            for (const g of this.groups) {
                if (g.id !== gid) continue;
                for (const k in params) {
                    if (k === 'id') continue;
                    if (['x','y','w','h'].includes(k)) g[k] = +params[k];
                    else g[k] = params[k];
                }
                return;
            }
        }
        removeGroup(gid) {
            this.groups = this.groups.filter(g => g.id !== gid);
        }

        invalidatePulses() { this.pulseCount = 0; }

        // -------------------------------------------------- simulation step

        step(extInput) {
            const n = this.n;
            if (n === 0) return;
            const cap = this.capacity;

            // 1. Advance and deliver pulses
            // (Compact in place; deliver weight on expiry.)
            const ISyn = new Float32Array(n);
            if (this.pulseCount > 0) {
                let write = 0;
                for (let k = 0; k < this.pulseCount; k++) {
                    this.pulseAge[k]++;
                    if (this.pulseAge[k] >= this.pulseDelay[k]) {
                        ISyn[this.pulseTo[k]] += this.pulseWeight[k];
                    } else {
                        if (write !== k) {
                            this.pulseFrom[write]   = this.pulseFrom[k];
                            this.pulseTo[write]     = this.pulseTo[k];
                            this.pulseAge[write]    = this.pulseAge[k];
                            this.pulseDelay[write]  = this.pulseDelay[k];
                            this.pulseWeight[write] = this.pulseWeight[k];
                        }
                        write++;
                    }
                }
                this.pulseCount = write;
            }

            // 2. LIF integration + spike detection (single pass)
            const newSpikes = new Uint8Array(n);
            for (let i = 0; i < n; i++) {
                const inRefr = this.refractoryLeft[i] > 0;
                const noise = this.noiseStd[i] > 0 ? this.noiseStd[i] * gaussian() : 0;
                const drive = this.V[i] * (1.0 - this.leak[i]) + ISyn[i] + extInput[i] + noise;
                let vNext = inRefr ? this.vReset[i] : drive;
                this.refractoryLeft[i] = Math.max(0, this.refractoryLeft[i] - 1);
                if (!inRefr && vNext >= this.threshold[i]) {
                    newSpikes[i] = 1;
                    vNext = this.vReset[i];
                    this.refractoryLeft[i] = this.refractoryPeriod[i];
                    this.spikeCount[i]++;
                }
                // Clamp V to v_min
                if (vNext < this.vMin[i]) vNext = this.vMin[i];
                this.V[i] = vNext;
                this.spikes[i] = newSpikes[i];
            }

            // 3. Spawn pulses for spiking neurons
            for (let j = 0; j < n; j++) {
                if (!newSpikes[j]) continue;
                for (let i = 0; i < n; i++) {
                    const w = this.W[i*cap + j];
                    if (w === 0) continue;
                    if (this.pulseCount >= this.MAX_PULSES) return;
                    const k = this.pulseCount;
                    this.pulseFrom[k]   = j;
                    this.pulseTo[k]     = i;
                    this.pulseAge[k]    = 0;
                    this.pulseDelay[k]  = Math.max(1, this.delaySteps[i*cap + j]);
                    this.pulseWeight[k] = w;
                    this.pulseCount++;
                }
            }
        }

        // -------------------------------------------------- snapshots

        snapshotState() {
            const n = this.n;
            const potentials = new Array(n);
            const rawV = new Array(n);
            const spikeCounts = new Array(n);
            for (let i = 0; i < n; i++) {
                const thr = this.threshold[i];
                let norm = thr > 0 ? this.V[i] / thr : 0;
                // Use v_min-aware lower bound so inhibition is visible
                let lowerBound = thr > 0 ? this.vMin[i] / thr : -1.0;
                if (lowerBound < -1.0) lowerBound = -1.0;
                if (norm < lowerBound) norm = lowerBound;
                if (norm > 1.0) norm = 1.0;
                potentials[i] = norm;
                rawV[i] = this.V[i];
                spikeCounts[i] = this.spikeCount[i];
                this.spikeCount[i] = 0;
            }
            return { ids: this.ids.slice(), potentials, raw_v: rawV, spike_counts: spikeCounts };
        }

        snapshotPulses(dt) {
            const pc = this.pulseCount;
            if (pc === 0) return { from_idx: [], to_idx: [], progress: [], duration: [], sign: [] };
            const fromIdx = new Array(pc);
            const toIdx   = new Array(pc);
            const progress = new Array(pc);
            const duration = new Array(pc);
            const sign     = new Array(pc);
            for (let k = 0; k < pc; k++) {
                fromIdx[k] = this.pulseFrom[k];
                toIdx[k]   = this.pulseTo[k];
                const d = Math.max(1, this.pulseDelay[k]);
                let p = this.pulseAge[k] / d;
                if (p < 0) p = 0; else if (p > 1) p = 1;
                progress[k] = p;
                duration[k] = d * dt;
                sign[k] = this.pulseWeight[k] >= 0 ? 1 : -1;
            }
            return { from_idx: fromIdx, to_idx: toIdx, progress, duration, sign };
        }

        topology() {
            const neurons = [];
            for (let i = 0; i < this.n; i++) {
                const id = this.ids[i];
                const m = this.meta[id];
                neurons.push({
                    id, label: m.label, kind: m.kind, x: m.x, y: m.y,
                    threshold: this.threshold[i],
                    leak: this.leak[i],
                    v_reset: this.vReset[i],
                    v_min: this.vMin[i],
                    refractory: this.refractoryPeriod[i],
                    noise_std: this.noiseStd[i],
                });
            }
            const synapses = [];
            const cap = this.capacity;
            for (let i = 0; i < this.n; i++) {
                for (let j = 0; j < this.n; j++) {
                    const w = this.W[i*cap + j];
                    if (w !== 0) {
                        synapses.push({
                            from: this.ids[j],
                            to: this.ids[i],
                            weight: w,
                            delay: this.delaySteps[i*cap + j],
                        });
                    }
                }
            }
            return {
                neurons, synapses,
                groups: this.groups.map(g => ({...g})),
            };
        }

        toJson() { return this.topology(); }

        loadJson(data, preservedKinds) {
            preservedKinds = preservedKinds || new Set();
            // Wipe
            this.n = 0;
            this.ids = [];
            this.idToIdx.clear();
            this.meta = {};
            for (let i = 0; i < this.capacity; i++) {
                this.V[i] = 0;
                this.threshold[i] = 1.0;
                this.leak[i] = 0.08;
                this.vReset[i] = 0;
                this.vMin[i] = -100.0;
                this.noiseStd[i] = 0;
                this.refractoryLeft[i] = 0;
                this.refractoryPeriod[i] = 2;
                this.spikes[i] = 0;
                this.spikeCount[i] = 0;
            }
            for (let k = 0; k < this.capacity * this.capacity; k++) {
                this.W[k] = 0;
                this.delaySteps[k] = 1;
            }
            this.pulseCount = 0;
            this.groups = [];

            for (const g of data.groups || []) {
                try {
                    this.addGroup(
                        g.id || `g${this.groups.length}`,
                        g.x || 0, g.y || 0,
                        g.w || 100, g.h || 80,
                        g.label || '', g.color || '#3a5cff',
                        g.comment || ''
                    );
                } catch (e) { /* ignore */ }
            }
            for (const n of data.neurons || []) {
                let kind = n.kind || 'inter';
                if (preservedKinds.has(n.id)) kind = preservedKindsMap(n.id);
                try {
                    this.addNeuron(n.id, {
                        label: n.label || n.id,
                        kind,
                        x: n.x || 0, y: n.y || 0,
                        threshold: n.threshold ?? 1.0,
                        leak: n.leak ?? 0.08,
                        v_reset: n.v_reset ?? 0,
                        v_min: n.v_min ?? -100.0,
                        refractory: n.refractory ?? 2,
                        noise_std: n.noise_std ?? 0,
                    });
                } catch (e) { /* duplicate ids etc */ }
            }
            for (const s of data.synapses || []) {
                try {
                    this.addSynapse(s.from, s.to, s.weight ?? 1.0, s.delay ?? 1);
                } catch (e) { /* ignore */ }
            }
        }
    }

    // ============================================================ Environment

    const FOOD_OVERLAP_HALF = (2.0 / 180) * PI;
    const hourAngle = (h) => (h - 12) * PI / 6;
    const SENSOR_ARCS = {
        food_left:    [hourAngle(8),          FOOD_OVERLAP_HALF],
        food_right:   [-FOOD_OVERLAP_HALF,    hourAngle(16)],
        threat_left:  [hourAngle(7),          hourAngle(12)],
        threat_right: [hourAngle(12),         hourAngle(17)],
    };
    function inArc(angle, arc) {
        const a = wrapPi(arc[0]), b = wrapPi(arc[1]), x = wrapPi(angle);
        return a <= b ? (a <= x && x <= b) : (x >= a || x <= b);
    }

    class Environment {
        constructor(width = 1100, height = 700) {
            this.taskId = 'BUG';
            this.kind = 'bug';
            this.width = width;
            this.height = height;
            this.obstacles = [];
            this.foods = [];
            this.threats = [];

            const lidarCount = 5;
            const lidarRange = 110;
            const lidarFov = PI * 0.55;
            const lidarAngles = [];
            if (lidarCount > 1) {
                const half = lidarFov / 2;
                const step = lidarFov / (lidarCount - 1);
                for (let i = 0; i < lidarCount; i++) lidarAngles.push(-half + i * step);
            } else lidarAngles.push(0);
            this.agent = {
                x: width / 2, y: height / 2,
                heading: 0, radius: 9,
                speedPerSpike: 1.6,
                turnPerSpike: 0.08,
                lidarCount, lidarRange, lidarFov,
                lidar_angles: lidarAngles,
                lidar_distances: new Array(lidarCount).fill(lidarRange),
                food_left: 0, food_right: 0,
                threat_left: 0, threat_right: 0,
                health: 1.0, hunger: 0, fatigue: 0,
                food_eaten: 0, damage_taken: 0,
            };

            this.foodTarget = 5;
            this.threatTarget = 0;
            this.threatLifetime = 12.0;
            this.hungerRate = 0.05;
            this.fatigueActionGain = 0.02;
            this.fatigueDecay = 0.10;
            this._nextId = 1;
            this.lastReward = 0.0;
        }

        _genId() { return ++this._nextId; }

        addFood(x, y, size = 6) {
            const f = { id: this._genId(), x: +x, y: +y, size };
            this.foods.push(f);
            return f;
        }
        addThreat(x, y, radius = 12, ttl = null) {
            if (ttl == null) ttl = this.threatLifetime;
            const t = { id: this._genId(), x: +x, y: +y, radius, ttl_left: +ttl };
            this.threats.push(t);
            return t;
        }
        addObstacle(x, y, w, h) {
            const o = { id: this._genId(), x: +x, y: +y, w: +w, h: +h };
            this.obstacles.push(o);
            return o;
        }
        removeObject(kind, oid) {
            const coll = { food: this.foods, threat: this.threats, obstacle: this.obstacles }[kind];
            if (!coll) return;
            const idx = coll.findIndex(o => o.id === oid);
            if (idx >= 0) coll.splice(idx, 1);
        }
        clearObjects(kind) {
            if (kind == null || kind === 'food') this.foods = [];
            if (kind == null || kind === 'threat') this.threats = [];
            if (kind == null || kind === 'obstacle') this.obstacles = [];
        }
        resetAgent() {
            const a = this.agent;
            a.x = this.width / 2;
            a.y = this.height / 2;
            a.heading = 0;
            a.health = 1; a.hunger = 0; a.fatigue = 0;
            a.food_eaten = 0; a.damage_taken = 0;
        }

        _pointInObstacle(x, y) {
            for (const o of this.obstacles) {
                if (o.x <= x && x <= o.x + o.w && o.y <= y && y <= o.y + o.h) return true;
            }
            return false;
        }
        _circleFree(x, y, r) {
            if (x - r < 0 || x + r > this.width || y - r < 0 || y + r > this.height) return false;
            for (const o of this.obstacles) {
                const cx = Math.max(o.x, Math.min(x, o.x + o.w));
                const cy = Math.max(o.y, Math.min(y, o.y + o.h));
                if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return false;
            }
            return true;
        }
        raycast(x, y, angle, maxRange) {
            const dx = Math.cos(angle), dy = Math.sin(angle);
            const step = 2.0;
            let d = 0;
            while (d < maxRange) {
                d += step;
                const px = x + dx * d, py = y + dy * d;
                if (px < 0 || px >= this.width || py < 0 || py >= this.height) return d;
                if (this._pointInObstacle(px, py)) return d;
            }
            return maxRange;
        }

        step(dt) {
            const a = this.agent;

            // Threat TTL / rotation
            const live = [];
            for (const t of this.threats) {
                t.ttl_left -= dt;
                if (t.ttl_left > 0) live.push(t);
            }
            this.threats = live;
            while (this.threats.length > this.threatTarget) this.threats.shift();
            let attempts = 0;
            while (this.threats.length < this.threatTarget && attempts < 10) {
                attempts++;
                const jitter = this.threats.length === 0
                    ? 0.5 + Math.random() * 0.5
                    : 0.85 + Math.random() * 0.15;
                this._spawnRandomThreat(this.threatLifetime * jitter);
            }

            // Lidars
            for (let i = 0; i < a.lidarCount; i++) {
                a.lidar_distances[i] = this.raycast(
                    a.x, a.y, a.heading + a.lidar_angles[i], a.lidarRange);
            }

            // Sensors with sector gating
            const K_FOOD = 1500, K_TH = 2500;
            a.food_left = 0; a.food_right = 0;
            a.threat_left = 0; a.threat_right = 0;
            for (const f of this.foods) {
                const dx = f.x - a.x, dy = f.y - a.y;
                const d2 = dx*dx + dy*dy + 4;
                const rel = wrapPi(Math.atan2(dy, dx) - a.heading);
                const c = K_FOOD / d2;
                if (inArc(rel, SENSOR_ARCS.food_left))  a.food_left  += c;
                if (inArc(rel, SENSOR_ARCS.food_right)) a.food_right += c;
            }
            for (const t of this.threats) {
                const dx = t.x - a.x, dy = t.y - a.y;
                const d2 = dx*dx + dy*dy + 4;
                const rel = wrapPi(Math.atan2(dy, dx) - a.heading);
                const c = K_TH / d2;
                if (inArc(rel, SENSOR_ARCS.threat_left))  a.threat_left  += c;
                if (inArc(rel, SENSOR_ARCS.threat_right)) a.threat_right += c;
            }

            // Food consumption (resets hunger)
            const survivors = [];
            for (const f of this.foods) {
                if ((a.x - f.x) ** 2 + (a.y - f.y) ** 2 < (a.radius + f.size) ** 2) {
                    a.food_eaten++;
                    a.health = Math.min(1, a.health + 0.1);
                    a.hunger = 0;
                } else survivors.push(f);
            }
            this.foods = survivors;

            // Top up food
            attempts = 0;
            while (this.foods.length < this.foodTarget && attempts < 10) {
                attempts++;
                this._spawnRandomFood();
            }

            // Threat damage
            for (const t of this.threats) {
                const d2 = (a.x - t.x) ** 2 + (a.y - t.y) ** 2;
                if (d2 < (a.radius + t.radius) ** 2) {
                    const dmg = 0.4 * dt;
                    a.health = Math.max(0, a.health - dmg);
                    a.damage_taken += dmg;
                }
            }

            // Hunger creeps; fatigue decays
            a.hunger  = Math.min(1, a.hunger  + this.hungerRate  * dt);
            a.fatigue = Math.max(0, a.fatigue - this.fatigueDecay * dt);
            this.lastReward = (a.food_eaten > 0 ? 0 : 0) - 0.01 * a.hunger;
        }

        _spawnRandomFood() {
            for (let i = 0; i < 20; i++) {
                const x = 15 + Math.random() * (this.width - 30);
                const y = 15 + Math.random() * (this.height - 30);
                if (this._circleFree(x, y, 8)) return this.addFood(x, y);
            }
            return null;
        }
        _spawnRandomThreat(ttl) {
            for (let i = 0; i < 20; i++) {
                const x = 20 + Math.random() * (this.width - 40);
                const y = 20 + Math.random() * (this.height - 40);
                if ((x - this.agent.x) ** 2 + (y - this.agent.y) ** 2 < 80*80) continue;
                if (this._circleFree(x, y, 14)) return this.addThreat(x, y, 12, ttl);
            }
            return null;
        }

        applyMotor(fwd, back, left, right) {
            const a = this.agent;
            const n = (fwd?1:0) + (back?1:0) + (left?1:0) + (right?1:0);
            if (n > 0) a.fatigue = Math.min(1, a.fatigue + this.fatigueActionGain * n);
            if (left)  a.heading -= a.turnPerSpike;
            if (right) a.heading += a.turnPerSpike;
            a.heading = wrapPi(a.heading);
            if (fwd)  this._tryMove(a.speedPerSpike);
            if (back) this._tryMove(-a.speedPerSpike * 0.7);
        }
        applyMotorActions(active) {
            this.applyMotor(
                !!active.motor_forward,
                !!active.motor_backward,
                !!active.motor_left,
                !!active.motor_right
            );
        }
        _tryMove(dist) {
            const a = this.agent;
            const nx = a.x + Math.cos(a.heading) * dist;
            const ny = a.y + Math.sin(a.heading) * dist;
            if (this._circleFree(nx, ny, a.radius)) {
                a.x = nx; a.y = ny;
            } else if (this._circleFree(nx, a.y, a.radius)) {
                a.x = nx;
            } else if (this._circleFree(a.x, ny, a.radius)) {
                a.y = ny;
            }
        }

        snapshot() {
            const a = this.agent;
            return {
                task_id: this.taskId,
                kind: this.kind,
                width: this.width, height: this.height,
                reward: this.lastReward,
                agent: {
                    x: a.x, y: a.y, heading: a.heading, radius: a.radius,
                    lidar_angles: a.lidar_angles.slice(),
                    lidar_distances: a.lidar_distances.slice(),
                    lidar_range: a.lidarRange,
                    food_left: a.food_left, food_right: a.food_right,
                    threat_left: a.threat_left, threat_right: a.threat_right,
                    health: a.health, hunger: a.hunger, fatigue: a.fatigue,
                    food_eaten: a.food_eaten,
                },
                foods: this.foods.map(f => ({...f})),
                threats: this.threats.map(t => ({...t})),
                obstacles: this.obstacles.map(o => ({...o})),
                food_target: this.foodTarget,
                threat_target: this.threatTarget,
                threat_lifetime: this.threatLifetime,
                hunger_rate: this.hungerRate,
                fatigue_action_gain: this.fatigueActionGain,
                fatigue_decay: this.fatigueDecay,
                sensor_arcs: Object.fromEntries(
                    Object.entries(SENSOR_ARCS).map(([k, v]) => [k, v.slice()])
                ),
            };
        }
    }

    // ============================================================ Classic control clones

    class CartPoleEnvironment {
        constructor() {
            this.taskId = 'CartPole';
            this.gymId = 'CartPole-v1-compatible';
            this.kind = 'gym';
            this.actionNames = ['left', 'right'];
            this.defaultAction = 0;
            this.gravity = 9.8;
            this.massCart = 1.0;
            this.massPole = 0.1;
            this.totalMass = this.massPole + this.massCart;
            this.length = 0.5;
            this.poleMassLength = this.massPole * this.length;
            this.forceMag = 10.0;
            this.tau = 0.02;
            this.thetaThreshold = 12 * 2 * PI / 360;
            this.xThreshold = 2.4;
            this.maxEpisodeSteps = 500;
            this.obs = [0, 0, 0, 0];
            this.resetStats();
            this.resetAgent();
        }
        resetStats() {
            this.lastReward = 0;
            this.episodeReturn = 0;
            this.episodeSteps = 0;
            this.episodeIndex = 0;
            this.lastDone = false;
            this.lastTerminated = false;
            this.lastTruncated = false;
            this.lastSuccess = false;
            this.lastEpisodeSteps = 0;
            this.lastEpisodeReturn = 0;
            this.bestSteps = 0;
            this.bestReturn = -Infinity;
            this.pendingAction = this.defaultAction;
            this.lastAction = this.defaultAction;
        }
        resetAgent() {
            this.obs = [uniform(-0.05, 0.05), uniform(-0.05, 0.05), uniform(-0.05, 0.05), uniform(-0.05, 0.05)];
            this.lastReward = 0;
            this.episodeReturn = 0;
            this.episodeSteps = 0;
            this.lastDone = false;
            this.lastTerminated = false;
            this.lastTruncated = false;
            this.lastSuccess = false;
            this.pendingAction = this.defaultAction;
            this.lastAction = this.defaultAction;
        }
        applyMotorActions(active) {
            const activeIdx = [];
            for (let i = 0; i < this.actionNames.length; i++) {
                if (active[`motor_${this.actionNames[i]}`]) activeIdx.push(i);
            }
            if (activeIdx.length) this.pendingAction = activeIdx[activeIdx.length - 1];
        }
        step(_dt) {
            this.lastAction = this.pendingAction;
            const [x, xDot, theta, thetaDot] = this.obs;
            const force = this.pendingAction === 1 ? this.forceMag : -this.forceMag;
            const cosTheta = Math.cos(theta);
            const sinTheta = Math.sin(theta);
            const temp = (force + this.poleMassLength * thetaDot * thetaDot * sinTheta) / this.totalMass;
            const thetaAcc = (this.gravity * sinTheta - cosTheta * temp) /
                (this.length * (4.0 / 3.0 - this.massPole * cosTheta * cosTheta / this.totalMass));
            const xAcc = temp - this.poleMassLength * thetaAcc * cosTheta / this.totalMass;
            const nx = x + this.tau * xDot;
            const nxDot = xDot + this.tau * xAcc;
            const nt = theta + this.tau * thetaDot;
            const ntDot = thetaDot + this.tau * thetaAcc;
            this.obs = [nx, nxDot, nt, ntDot];
            this.episodeSteps++;
            const terminated = nx < -this.xThreshold || nx > this.xThreshold ||
                nt < -this.thetaThreshold || nt > this.thetaThreshold;
            const truncated = this.episodeSteps >= this.maxEpisodeSteps;
            const done = terminated || truncated;
            this.lastReward = 1.0;
            this.episodeReturn += this.lastReward;
            this.lastDone = done;
            this.lastTerminated = terminated;
            this.lastTruncated = truncated;
            this.lastSuccess = truncated && !terminated;
            if (done) this.finishEpisode();
            return { reward: this.lastReward, done };
        }
        finishEpisode() {
            const steps = this.episodeSteps;
            const ret = this.episodeReturn;
            this.lastEpisodeSteps = steps;
            this.lastEpisodeReturn = ret;
            if (steps > this.bestSteps) this.bestSteps = steps;
            if (ret > this.bestReturn) this.bestReturn = ret;
            this.episodeIndex++;
            this.obs = [uniform(-0.05, 0.05), uniform(-0.05, 0.05), uniform(-0.05, 0.05), uniform(-0.05, 0.05)];
            this.episodeSteps = 0;
            this.episodeReturn = 0;
        }
        snapshot() {
            const [x, _xDot, theta, _thetaDot] = this.obs;
            return {
                task: 'cartpole',
                task_id: this.taskId,
                gym_id: this.gymId,
                kind: this.kind,
                width: 1100,
                height: 700,
                observation: this.obs.slice(),
                reward: this.lastReward,
                episode_return: this.episodeReturn,
                episode_steps: this.episodeSteps,
                episode_index: this.episodeIndex,
                episode: this.episodeIndex,
                steps: this.episodeSteps,
                last_episode_steps: this.lastEpisodeSteps,
                last_episode_return: this.lastEpisodeReturn,
                best_steps: this.bestSteps,
                best_score: this.bestReturn,
                done: this.lastDone,
                terminated: this.lastTerminated,
                truncated: this.lastTruncated,
                success: this.lastSuccess,
                done_reason: this.doneReason(),
                action: this.lastAction,
                action_name: this.actionNames[this.lastAction],
                x,
                theta,
                x_limit: this.xThreshold,
                pole_half_len: this.length,
                force_dir: this.lastAction === 0 ? -1 : 1,
                agent: { health: 1, hunger: 0, fatigue: 0, food_eaten: Math.round(this.episodeReturn) },
                foods: [],
                threats: [],
                obstacles: [],
            };
        }
        doneReason() {
            if (!this.lastDone) return '';
            if (this.lastSuccess) return 'time limit';
            if (this.lastTerminated) return 'fallen';
            return 'done';
        }
        resize() {}
        addFood() {}
        addThreat() {}
        addObstacle() {}
        removeObject() {}
        clearObjects() {}
    }

    class MountainCarEnvironment {
        constructor() {
            this.taskId = 'MountainCar';
            this.gymId = 'MountainCar-v0-compatible';
            this.kind = 'gym';
            this.actionNames = ['left', 'coast', 'right'];
            this.defaultAction = 1;
            this.minPosition = -1.2;
            this.maxPosition = 0.6;
            this.maxSpeed = 0.07;
            this.goalPosition = 0.5;
            this.goalVelocity = 0.0;
            this.force = 0.001;
            this.gravity = 0.0025;
            this.maxEpisodeSteps = 200;
            this.positionNeutral = -0.5;
            this.obs = [-0.5, 0];
            this.resetStats();
            this.resetAgent();
        }
        resetStats() {
            this.lastReward = 0;
            this.episodeReturn = 0;
            this.episodeSteps = 0;
            this.episodeIndex = 0;
            this.lastDone = false;
            this.lastTerminated = false;
            this.lastTruncated = false;
            this.lastSuccess = false;
            this.lastEpisodeSteps = 0;
            this.lastEpisodeReturn = 0;
            this.bestSteps = 0;
            this.bestReturn = -Infinity;
            this.pendingAction = this.defaultAction;
            this.lastAction = this.defaultAction;
        }
        resetAgent() {
            const pos = uniform(-0.6, -0.4);
            this.obs = [pos, 0.0];
            this.positionNeutral = pos;
            this.lastReward = 0;
            this.episodeReturn = 0;
            this.episodeSteps = 0;
            this.lastDone = false;
            this.lastTerminated = false;
            this.lastTruncated = false;
            this.lastSuccess = false;
            this.pendingAction = this.defaultAction;
            this.lastAction = this.defaultAction;
        }
        applyMotorActions(active) {
            const activeIdx = [];
            for (let i = 0; i < this.actionNames.length; i++) {
                if (active[`motor_${this.actionNames[i]}`]) activeIdx.push(i);
            }
            if (activeIdx.length) this.pendingAction = activeIdx[activeIdx.length - 1];
        }
        step(_dt) {
            this.lastAction = this.pendingAction;
            let [pos, vel] = this.obs;
            vel += (this.pendingAction - 1) * this.force + Math.cos(3 * pos) * (-this.gravity);
            vel = clamp(vel, -this.maxSpeed, this.maxSpeed);
            pos += vel;
            pos = clamp(pos, this.minPosition, this.maxPosition);
            if (pos === this.minPosition && vel < 0) vel = 0;
            this.obs = [pos, vel];
            this.episodeSteps++;
            const terminated = pos >= this.goalPosition && vel >= this.goalVelocity;
            const truncated = this.episodeSteps >= this.maxEpisodeSteps;
            const done = terminated || truncated;
            this.lastReward = -1.0;
            this.episodeReturn += this.lastReward;
            this.lastDone = done;
            this.lastTerminated = terminated;
            this.lastTruncated = truncated;
            this.lastSuccess = terminated && !truncated;
            if (done) this.finishEpisode();
            return { reward: this.lastReward, done };
        }
        finishEpisode() {
            const steps = this.episodeSteps;
            const ret = this.episodeReturn;
            this.lastEpisodeSteps = steps;
            this.lastEpisodeReturn = ret;
            if (ret > this.bestReturn) this.bestReturn = ret;
            if (this.lastSuccess && (this.bestSteps <= 0 || steps < this.bestSteps)) this.bestSteps = steps;
            this.episodeIndex++;
            const pos = uniform(-0.6, -0.4);
            this.obs = [pos, 0.0];
            this.positionNeutral = pos;
            this.episodeSteps = 0;
            this.episodeReturn = 0;
        }
        snapshot() {
            const [pos, vel] = this.obs;
            return {
                task: 'mountain_car',
                task_id: this.taskId,
                gym_id: this.gymId,
                kind: this.kind,
                width: 1100,
                height: 700,
                observation: this.obs.slice(),
                reward: this.lastReward,
                episode_return: this.episodeReturn,
                episode_steps: this.episodeSteps,
                episode_index: this.episodeIndex,
                episode: this.episodeIndex,
                steps: this.episodeSteps,
                last_episode_steps: this.lastEpisodeSteps,
                last_episode_return: this.lastEpisodeReturn,
                best_steps: this.bestSteps,
                best_score: this.bestReturn,
                done: this.lastDone,
                terminated: this.lastTerminated,
                truncated: this.lastTruncated,
                success: this.lastSuccess,
                done_reason: this.doneReason(),
                action: this.lastAction - 1,
                action_name: this.actionNames[this.lastAction],
                pos,
                vel,
                min_pos: this.minPosition,
                max_pos: this.maxPosition,
                goal_pos: this.goalPosition,
                solved: this.lastSuccess,
                agent: { health: 1, hunger: 0, fatigue: 0, food_eaten: Math.round(this.episodeReturn) },
                foods: [],
                threats: [],
                obstacles: [],
            };
        }
        doneReason() {
            if (!this.lastDone) return '';
            if (this.lastSuccess) return 'goal';
            if (this.lastTruncated) return 'time limit';
            return 'done';
        }
        resize() {}
        addFood() {}
        addThreat() {}
        addObstacle() {}
        removeObject() {}
        clearObjects() {}
    }

    // ============================================================ App glue

    const NEURON_CAPACITY = 512;
    const SIM_DT     = 0.01;     // 10 ms LIF time step
    const SIM_HZ_MAX = 100;
    const GYM_ENV_HZ_MAX = 240;

    // Sensor signal → LIF input current (same constants as app.py)
    const I_MAX = 1.0;
    const FOOD_REF_STRONG    = 3.0;
    const THREAT_REF_STRONG  = 4.0;
    const LIDAR_REF_STRONG   = 1.0;
    const HUNGER_REF_STRONG  = 1.0;
    const FATIGUE_REF_STRONG = 1.0;
    const MANUAL_MOTOR_DRIVE = 1.5;
    const SENSOR_LEAK = 0.02;
    const SENSOR_REFRACTORY = 2;
    const GYM_SENSOR_REFRACTORY = 0;
    const MOTOR_LEAK = 0.12;

    const TASK_SPECS = {
        BUG: {
            label: 'BUG',
            kind: 'bug',
            factory: () => new Environment(),
            motors: ['motor_forward', 'motor_backward', 'motor_left', 'motor_right'],
            defaults: [
                ['sensor_food_left',    'Food L',   'sensor', 60,  60],
                ['sensor_food_right',   'Food R',   'sensor', 60, 110],
                ['sensor_threat_left',  'Threat L', 'sensor', 60, 170],
                ['sensor_threat_right', 'Threat R', 'sensor', 60, 220],
                ['sensor_hunger',       'Hunger',   'sensor', 60, 280],
                ['sensor_fatigue',      'Fatigue',  'sensor', 60, 330],
                ['lidar_0',             'Lidar 1',  'sensor', 60, 400],
                ['lidar_1',             'Lidar 2',  'sensor', 60, 440],
                ['lidar_2',             'Lidar 3',  'sensor', 60, 480],
                ['lidar_3',             'Lidar 4',  'sensor', 60, 520],
                ['lidar_4',             'Lidar 5',  'sensor', 60, 560],
                ['motor_forward',       'Forward',  'motor', 720, 100],
                ['motor_backward',      'Back',     'motor', 720, 200],
                ['motor_left',          'Turn L',   'motor', 720, 300],
                ['motor_right',         'Turn R',   'motor', 720, 400],
            ],
        },
        CartPole: {
            label: 'CartPole',
            kind: 'gym',
            factory: () => new CartPoleEnvironment(),
            motors: ['motor_left', 'motor_right'],
            rewardMode: 'survival_up',
            rewardSteps: 500,
            obs: [
                ['cart_position', 'Cart X', 2.4],
                ['cart_velocity', 'Cart V', 3.0],
                ['pole_angle', 'Pole angle', 0.42],
                ['pole_angular_velocity', 'Pole ang V', 3.5],
            ],
        },
        MountainCar: {
            label: 'MountainCar',
            kind: 'gym',
            factory: () => new MountainCarEnvironment(),
            motors: ['motor_left', 'motor_coast', 'motor_right'],
            rewardMode: 'time_budget_down',
            rewardSteps: 200,
            obs: [
                ['position', 'Position', 1.2],
                ['velocity', 'Velocity', 0.07],
            ],
        },
    };

    function signalToCurrent(raw, strongRef) {
        if (strongRef <= 0) return 0;
        let s = raw / strongRef;
        if (s < 0) s = 0; else if (s > 1) s = 1;
        return s * I_MAX;
    }

    const snn = new SpikingNetwork(NEURON_CAPACITY);
    let currentTask = 'BUG';
    let env = TASK_SPECS[currentTask].factory();
    const manualMotor = {};
    const DEFAULT_NEURON_IDS = new Set();

    function normalizeTask(task) {
        return TASK_SPECS[task] ? task : 'BUG';
    }

    function gymDefaultNeurons(task) {
        const spec = TASK_SPECS[task];
        const defs = [];
        let y = 70;
        for (const [obsId, label] of spec.obs) {
            defs.push([`sensor_${obsId}_pos`, `${label} +`, 'sensor', 60, y]);
            y += 45;
            defs.push([`sensor_${obsId}_neg`, `${label} -`, 'sensor', 60, y]);
            y += 55;
        }
        defs.push(['sensor_reward', 'Reward', 'sensor', 60, y + 20]);
        let my = 120;
        for (const motorId of spec.motors) {
            const label = motorId.replace(/^motor_/, '').replaceAll('_', ' ')
                .replace(/\b\w/g, ch => ch.toUpperCase());
            defs.push([motorId, label, 'motor', 720, my]);
            my += 90;
        }
        return defs;
    }

    function defaultDefsFor(task) {
        const spec = TASK_SPECS[task];
        return spec.kind === 'gym' ? gymDefaultNeurons(task) : spec.defaults.slice();
    }

    function defaultNeuronParams(task, nid, kind) {
        return {
            threshold: task === 'MountainCar' && nid === 'sensor_reward' ? 10.0 : 1.0,
            refractory: kind === 'sensor'
                ? (TASK_SPECS[task].kind === 'gym' ? GYM_SENSOR_REFRACTORY : SENSOR_REFRACTORY)
                : 3,
        };
    }

    function buildDefaultNetwork(task = currentTask, reset = false) {
        task = normalizeTask(task);
        if (reset) snn.loadJson({ neurons: [], synapses: [], groups: [] }, new Set());
        DEFAULT_NEURON_IDS.clear();
        const defs = defaultDefsFor(task);
        for (const [id, label, kind, x, y] of defs) {
            DEFAULT_NEURON_IDS.add(id);
            if (snn.idToIdx.has(id)) continue;
            const params = defaultNeuronParams(task, id, kind);
            snn.addNeuron(id, {
                label, kind, x, y,
                threshold: params.threshold,
                leak: kind === 'motor' ? MOTOR_LEAK : SENSOR_LEAK,
                v_reset: 0,
                refractory: params.refractory,
                noise_std: 0,
            });
        }
        enforceDefaultReceptorParams(task);
    }
    buildDefaultNetwork();

    function buildOneDefault(nid) {
        const rec = defaultDefsFor(currentTask).find(d => d[0] === nid);
        const kind = rec ? rec[2] : preservedKindsMap(nid);
        const label = rec ? rec[1] : nid;
        const x = rec ? rec[3] : 300;
        const y = rec ? rec[4] : 300;
        const params = defaultNeuronParams(currentTask, nid, kind);
        snn.addNeuron(nid, {
            label, kind, x, y,
            threshold: params.threshold,
            leak: kind === 'motor' ? MOTOR_LEAK : SENSOR_LEAK,
            v_reset: 0,
            refractory: params.refractory,
            noise_std: 0,
        });
    }

    function enforceDefaultReceptorParams(task = currentTask) {
        if (TASK_SPECS[task].kind !== 'gym') return;
        for (const id of DEFAULT_NEURON_IDS) {
            const rec = defaultDefsFor(task).find(d => d[0] === id);
            if (rec && rec[2] === 'sensor') {
                const params = defaultNeuronParams(task, id, rec[2]);
                snn.updateNeuron(id, { threshold: params.threshold, refractory: params.refractory });
            }
        }
    }

    function resetManualMotor() {
        for (const k of Object.keys(manualMotor)) delete manualMotor[k];
        for (const motorId of TASK_SPECS[currentTask].motors) {
            manualMotor[motorId.replace(/^motor_/, '')] = false;
        }
    }
    resetManualMotor();

    function gymRewardSignal(task) {
        const spec = TASK_SPECS[task];
        const steps = env.lastDone ? (env.lastEpisodeSteps || 0) : (env.episodeSteps || 0);
        const phase = clamp(steps / Math.max(1, spec.rewardSteps || 1), 0, 1);
        if (spec.rewardMode === 'survival_up') return phase;
        if (spec.rewardMode === 'time_budget_down') return 1.0 - phase;
        return clamp(env.lastReward || 0, 0, 1);
    }

    function gymObservationComponents(task, obsId, raw, strongRef) {
        if (task === 'MountainCar' && obsId === 'position') {
            const minPos = env.minPosition ?? -1.2;
            const maxPos = env.maxPosition ?? 0.6;
            const neutral = env.positionNeutral ?? -0.5;
            const pos = Math.max(0, raw - neutral);
            const neg = Math.max(0, neutral - raw);
            return [pos, neg, Math.max(0.001, maxPos - neutral), Math.max(0.001, neutral - minPos)];
        }
        return [Math.max(0, raw), Math.max(0, -raw), strongRef, strongRef];
    }

    const extBuf = new Float32Array(NEURON_CAPACITY);
    function computeExternalInput() {
        extBuf.fill(0);
        const idx = (nid) => snn.idToIdx.get(nid);
        let i;
        if (currentTask === 'BUG') {
            const a = env.agent;
            if ((i = idx('sensor_food_left'))   !== undefined) extBuf[i] = signalToCurrent(a.food_left,   FOOD_REF_STRONG);
            if ((i = idx('sensor_food_right'))  !== undefined) extBuf[i] = signalToCurrent(a.food_right,  FOOD_REF_STRONG);
            if ((i = idx('sensor_threat_left')) !== undefined) extBuf[i] = signalToCurrent(a.threat_left, THREAT_REF_STRONG);
            if ((i = idx('sensor_threat_right'))!== undefined) extBuf[i] = signalToCurrent(a.threat_right,THREAT_REF_STRONG);
            if ((i = idx('sensor_hunger'))      !== undefined) extBuf[i] = signalToCurrent(a.hunger,      HUNGER_REF_STRONG);
            if ((i = idx('sensor_fatigue'))     !== undefined) extBuf[i] = signalToCurrent(a.fatigue,     FATIGUE_REF_STRONG);
            for (let k = 0; k < a.lidarCount; k++) {
                if ((i = idx(`lidar_${k}`)) !== undefined) {
                    const prox = Math.max(0, 1 - a.lidar_distances[k] / a.lidarRange);
                    extBuf[i] = signalToCurrent(prox, LIDAR_REF_STRONG);
                }
            }
        } else {
            const spec = TASK_SPECS[currentTask];
            for (let k = 0; k < spec.obs.length && k < env.obs.length; k++) {
                const [obsId, _label, strongRef] = spec.obs[k];
                const [pos, neg, posRef, negRef] = gymObservationComponents(currentTask, obsId, +env.obs[k], strongRef);
                if ((i = idx(`sensor_${obsId}_pos`)) !== undefined) extBuf[i] = signalToCurrent(pos, posRef);
                if ((i = idx(`sensor_${obsId}_neg`)) !== undefined) extBuf[i] = signalToCurrent(neg, negRef);
            }
        }
        if ((i = idx('sensor_reward')) !== undefined && currentTask !== 'BUG') {
            extBuf[i] = signalToCurrent(gymRewardSignal(currentTask), 1.0);
        }
        for (const motorId of TASK_SPECS[currentTask].motors) {
            const key = motorId.replace(/^motor_/, '');
            if (manualMotor[key] && (i = idx(motorId)) !== undefined) extBuf[i] += MANUAL_MOTOR_DRIVE;
        }
        return extBuf;
    }

    function activeMotorSpikes() {
        const active = {};
        const motors = TASK_SPECS[currentTask].motors;
        if (currentTask !== 'BUG') {
            let anyManual = false;
            for (const motorId of motors) {
                const key = motorId.replace(/^motor_/, '');
                active[motorId] = !!manualMotor[key];
                anyManual = anyManual || active[motorId];
            }
            if (anyManual) return active;
        }
        for (const motorId of motors) {
            const idx = snn.idToIdx.get(motorId);
            active[motorId] = idx !== undefined && snn.spikes[idx] === 1;
        }
        return active;
    }

    function currentNetworkPayload() {
        const payload = snn.topology();
        payload.task = currentTask;
        payload.format_version = 2;
        return payload;
    }

    function switchTask(task, resetNetwork = false) {
        currentTask = normalizeTask(task);
        env = TASK_SPECS[currentTask].factory();
        window.envInstance = env;
        simTime = 0;
        gymEnvAccumWall = 0;
        resetManualMotor();
        buildDefaultNetwork(currentTask, resetNetwork);
    }

    // -------------------------------------------------- main loop

    let running = true;
    let simHz   = SIM_HZ_MAX;
    let gymEnvHz = 30;
    let simTime = 0;
    let simAccumWall = 0;
    let gymEnvAccumWall = 0;
    let lastTickWall = performance.now();
    const topologyListeners = new Set();

    function emitTopology() {
        const payload = {
            topology: currentNetworkPayload(),
            default_neurons: Array.from(DEFAULT_NEURON_IDS),
            task: currentTask,
            tasks: Object.entries(TASK_SPECS).map(([id, spec]) => ({
                id, label: spec.label, kind: spec.kind,
            })),
            motors: TASK_SPECS[currentTask].motors.slice(),
        };
        if (window.editorView) {
            window.editorView.setTopology(payload.topology, payload.default_neurons);
        }
        if (window.appUI && window.appUI.onTopology) window.appUI.onTopology(payload);
        for (const fn of topologyListeners) fn(payload);
    }

    function broadcastFrame() {
        const envSnap = env.snapshot();
        if (currentTask !== 'BUG') envSnap.reward_signal = gymRewardSignal(currentTask);
        if (window.envView) window.envView.update(envSnap);
        if (window.editorView) {
            window.editorView.setActivity(snn.snapshotState());
            window.editorView.setPulses(snn.snapshotPulses(SIM_DT));
        }
        if (window.appUI) window.appUI.onState({
            t: simTime,
            sim_hz: simHz,
            gym_env_hz: gymEnvHz,
            running,
            env: envSnap,
        });
    }

    function tick() {
        const now = performance.now();
        const dtWall = (now - lastTickWall) / 1000;
        lastTickWall = now;

        if (running) {
            simAccumWall += dtWall;
            const wallPerStep = 1 / Math.max(1, Math.min(SIM_HZ_MAX, simHz));
            // Cap catch-up to ~5 simulated steps per RAF tick (avoid runaway after long pauses).
            const maxSteps = 5;
            let steps = 0;
            while (simAccumWall >= wallPerStep && steps < maxSteps) {
                const ext = computeExternalInput();
                snn.step(ext);
                env.applyMotorActions(activeMotorSpikes());
                if (currentTask === 'BUG') {
                    env.step(SIM_DT);
                    simTime += SIM_DT;
                }
                simAccumWall -= wallPerStep;
                steps++;
            }
            // If we couldn't keep up, drop the surplus to stay realtime-ish.
            if (simAccumWall > wallPerStep * maxSteps) simAccumWall = wallPerStep * maxSteps;

            if (currentTask !== 'BUG') {
                const envDt = 1 / Math.max(1, Math.min(GYM_ENV_HZ_MAX, gymEnvHz));
                gymEnvAccumWall += dtWall;
                let envSteps = 0;
                while (gymEnvAccumWall >= envDt && envSteps < GYM_ENV_HZ_MAX) {
                    env.step(envDt);
                    simTime += envDt;
                    gymEnvAccumWall -= envDt;
                    envSteps++;
                }
                if (gymEnvAccumWall > envDt * GYM_ENV_HZ_MAX) gymEnvAccumWall = 0;
            }
        } else {
            simAccumWall = 0;
            gymEnvAccumWall = 0;
        }

        broadcastFrame();
        requestAnimationFrame(tick);
    }

    // -------------------------------------------------- appSocket (event bus)

    const appBus = {
        on(event, fn) {
            if (event === 'topology' && typeof fn === 'function') topologyListeners.add(fn);
        },
        emit(event, msg = {}) {
            switch (event) {
                case 'control': {
                    switch (msg.action) {
                        case 'play':   running = true;  lastTickWall = performance.now(); simAccumWall = 0; break;
                        case 'pause':  running = false; break;
                        case 'reset_agent':   env.resetAgent(); break;
                        case 'reset_network':
                            for (let i = 0; i < snn.capacity; i++) {
                                snn.V[i] = 0;
                                snn.refractoryLeft[i] = 0;
                                snn.spikes[i] = 0;
                                snn.spikeCount[i] = 0;
                            }
                            snn.pulseCount = 0;
                            break;
                    }
                    return;
                }
                case 'set_sim_hz': {
                    const v = parseInt(msg.hz, 10);
                    if (Number.isFinite(v)) simHz = Math.max(1, Math.min(SIM_HZ_MAX, v));
                    return;
                }
                case 'set_gym_env_hz': {
                    const v = parseInt(msg.hz, 10);
                    if (Number.isFinite(v)) gymEnvHz = Math.max(1, Math.min(GYM_ENV_HZ_MAX, v));
                    return;
                }
                case 'set_task': {
                    const task = normalizeTask(msg.task || currentTask);
                    if (task !== currentTask) switchTask(task, true);
                    emitTopology();
                    broadcastFrame();
                    return;
                }
                case 'place_object': {
                    const { kind, x, y } = msg;
                    if (currentTask !== 'BUG') return;
                    if (kind === 'food')     env.addFood(x, y);
                    else if (kind === 'threat') env.addThreat(x, y, +msg.radius || 12);
                    else if (kind === 'obstacle') env.addObstacle(x - msg.w/2, y - msg.h/2, msg.w, msg.h);
                    else if (kind === 'agent' && env.agent) { env.agent.x = +x; env.agent.y = +y; }
                    return;
                }
                case 'remove_object': env.removeObject(msg.kind, +msg.id); return;
                case 'clear_objects': env.clearObjects(msg.kind); return;
                case 'world_params': {
                    if ('food_target'         in msg) env.foodTarget         = Math.max(0, parseInt(msg.food_target, 10));
                    if ('threat_target'       in msg) env.threatTarget       = Math.max(0, parseInt(msg.threat_target, 10));
                    if ('threat_lifetime'     in msg) env.threatLifetime     = Math.max(0.5, +msg.threat_lifetime);
                    if ('hunger_rate'         in msg) env.hungerRate         = Math.max(0, +msg.hunger_rate);
                    if ('fatigue_action_gain' in msg) env.fatigueActionGain  = Math.max(0, +msg.fatigue_action_gain);
                    if ('fatigue_decay'       in msg) env.fatigueDecay       = Math.max(0, +msg.fatigue_decay);
                    return;
                }
                case 'manual_motor':
                    for (const k of Object.keys(manualMotor)) {
                        if (k in msg) manualMotor[k] = !!msg[k];
                    }
                    return;
                case 'add_neuron':
                    try {
                        snn.addNeuron(msg.id, {
                            label: msg.label, kind: msg.kind ?? 'inter',
                            x: msg.x, y: msg.y,
                            threshold: msg.threshold, leak: msg.leak,
                            v_reset: msg.v_reset, v_min: msg.v_min,
                            refractory: msg.refractory,
                            noise_std: msg.noise_std,
                        });
                    } catch (e) { console.warn(e); }
                    emitTopology();
                    return;
                case 'update_neuron':
                    snn.updateNeuron(msg.id, msg);
                    emitTopology();
                    return;
                case 'remove_neuron':
                    try { snn.removeNeuron(msg.id); } catch (e) { console.warn(e); }
                    emitTopology();
                    return;
                case 'add_synapse':
                    snn.addSynapse(msg.from, msg.to, msg.weight ?? 1.0, msg.delay ?? 5);
                    emitTopology();
                    return;
                case 'remove_synapse':
                    snn.removeSynapse(msg.from, msg.to);
                    emitTopology();
                    return;
                case 'add_group':
                    snn.addGroup(msg.id, msg.x, msg.y, msg.w, msg.h,
                                  msg.label ?? '', msg.color ?? '#3a5cff', msg.comment ?? '');
                    emitTopology();
                    return;
                case 'update_group':
                    snn.updateGroup(msg.id, msg);
                    emitTopology();
                    return;
                case 'remove_group':
                    snn.removeGroup(msg.id);
                    emitTopology();
                    return;
                case 'load_network':
                    if (msg.data) {
                        const task = normalizeTask(msg.data.task || 'BUG');
                        if (task !== currentTask) switchTask(task, true);
                        snn.loadJson(msg.data, DEFAULT_NEURON_IDS);
                        for (const id of DEFAULT_NEURON_IDS) {
                            if (!snn.idToIdx.has(id)) buildOneDefault(id);
                        }
                        enforceDefaultReceptorParams(currentTask);
                        emitTopology();
                        broadcastFrame();
                    }
                    return;
                default:
                    console.warn('unknown appBus event:', event, msg);
            }
        },
    };

    // -------------------------------------------------- expose globals

    window.appSocket    = appBus;
    window.snnInstance  = snn;
    window.envInstance  = env;
    window.simEngine = {
        startLoop() {
            lastTickWall = performance.now();
            emitTopology();
            requestAnimationFrame(tick);
        },
        getTopology()        { return currentNetworkPayload(); },
        getDefaultNeurons()  { return Array.from(DEFAULT_NEURON_IDS); },
        getTask()            { return currentTask; },
        getTasks() {
            return Object.entries(TASK_SPECS).map(([id, spec]) => ({ id, label: spec.label, kind: spec.kind }));
        },
        loadJson(data) {
            const task = normalizeTask(data.task || 'BUG');
            if (task !== currentTask) switchTask(task, true);
            snn.loadJson(data, DEFAULT_NEURON_IDS);
            for (const id of DEFAULT_NEURON_IDS) {
                if (!snn.idToIdx.has(id)) buildOneDefault(id);
            }
            enforceDefaultReceptorParams(currentTask);
            emitTopology();
            broadcastFrame();
        },
    };
})();
