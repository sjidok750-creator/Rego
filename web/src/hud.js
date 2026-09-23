// Heads-up display. Every visual state is derived from t each frame (no CSS
// transitions), so a captured frame is identical to the live one.
import * as THREE from 'three';
import { PHASES } from './parts.js';
import { smooth } from './choreo.js';

const $ = (sel, root = document) => root.querySelector(sel);
const fmt = (x, d = 2) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const int = (x) => Math.round(x).toLocaleString('en-US');
const mmss = (t) => {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
};

export function createHud(root, ch, { capture }) {
  const { parts } = ch;
  const N = parts.length;
  const pieceCount = ch.pieces.length;
  const totalMass = parts.reduce((s, p) => s + p.mass, 0);

  root.innerHTML = `
    <header class="brand" id="brand">
      <div class="eyebrow">國寶 · 慶州 佛國寺 · 統一新羅 751</div>
      <div class="title"><span class="han">多寶塔</span><span class="ko">다보탑 해체 기록</span></div>
      <div class="edition" id="edition"></div>
    </header>
    <section class="counter" id="counter">
      <div class="label">해체 부재</div>
      <div class="count"><span id="cnt-now">00</span><span class="of">/ ${N}</span></div>
      <div class="meta" id="cnt-meta"></div>
    </section>
    <ol class="ledger" id="ledger">
      ${parts.map((p) => `<li data-i="${p.index}"><span class="no">${p.no}</span><span class="nm">${p.name}</span><span class="st"></span></li>`).join('')}
    </ol>
    <svg class="leader" id="leader" aria-hidden="true"><polyline id="leader-line" points="" /><circle id="leader-dot" r="7" cx="-99" cy="-99" /><circle id="leader-pin" r="2.5" cx="-99" cy="-99" /></svg>
    <div class="tags" id="tags"></div>
    <section class="callout" id="callout">
      <div class="c-top"><span class="c-no" id="c-no"></span><span class="c-phase" id="c-phase"></span></div>
      <div class="c-name"><span id="c-name"></span><span class="c-han" id="c-han"></span></div>
      <div class="c-en" id="c-en"></div>
      <p class="c-desc" id="c-desc"></p>
      <dl class="c-spec" id="c-spec"></dl>
    </section>
    <div class="banner" id="banner"><span class="b-roman" id="b-roman"></span><span class="b-name" id="b-name"></span><span class="b-sub" id="b-sub"></span></div>
    <div class="card" id="card"></div>
    <footer class="timeline" id="timeline">
      <div class="controls" id="controls"></div>
      <div class="track" id="track">
        <div class="segs" id="segs"></div>
        <div class="fill" id="fill"></div>
        <div class="ticks" id="ticks"></div>
        <div class="head" id="head"></div>
      </div>
      <div class="tc" id="tc"></div>
    </footer>`;

  const el = {
    edition: $('#edition', root), cntNow: $('#cnt-now', root), cntMeta: $('#cnt-meta', root),
    ledger: [...root.querySelectorAll('#ledger li')], callout: $('#callout', root),
    cNo: $('#c-no', root), cPhase: $('#c-phase', root), cName: $('#c-name', root), cHan: $('#c-han', root),
    cEn: $('#c-en', root), cDesc: $('#c-desc', root), cSpec: $('#c-spec', root),
    leader: $('#leader', root), line: $('#leader-line', root), dot: $('#leader-dot', root), pin: $('#leader-pin', root),
    tags: $('#tags', root), banner: $('#banner', root), bRoman: $('#b-roman', root), bName: $('#b-name', root), bSub: $('#b-sub', root),
    card: $('#card', root), fill: $('#fill', root), head: $('#head', root), tc: $('#tc', root), segs: $('#segs', root), ticks: $('#ticks', root),
    brand: $('#brand', root), counter: $('#counter', root), ledgerBox: $('#ledger', root), timeline: $('#timeline', root),
  };

  // Timeline segments
  const segDefs = [
    ['서막', 0, ch.T_INTRO],
    ...PHASES.map((ph, i) => {
      const first = parts.find((p) => p.phase === i), lastP = [...parts].reverse().find((p) => p.phase === i);
      const nextFirst = parts.find((p) => p.phase === i + 1);
      return [ph.name, i === 0 ? ch.T_INTRO : first.t0 - 0.6, nextFirst ? nextFirst.t0 - 0.6 : Math.max(lastP.tLand, ch.disEnd)];
    }),
    ['적치', ch.disEnd, ch.E0],
    ['분해도', ch.E0, ch.C0],
    ['재조립', ch.C0, ch.END],
  ];
  el.segs.innerHTML = segDefs.map(([n, a, b]) => `<span style="left:${(a / ch.END) * 100}%;width:${((b - a) / ch.END) * 100}%"><em>${n}</em></span>`).join('');
  el.ticks.innerHTML = parts.map((p) => `<i style="left:${(p.t0 / ch.END) * 100}%"></i>`).join('');

  // Bay tags and exploded-view labels (created once, positioned per frame)
  const tagEls = parts.map((p) => {
    const d = document.createElement('div');
    d.className = 'tag';
    d.innerHTML = `<b>${p.no}</b><span>${p.name}</span>`;
    el.tags.appendChild(d);
    return d;
  });
  const xEls = parts.map((p) => {
    const d = document.createElement('div');
    d.className = 'xlabel';
    d.innerHTML = `<b>${p.no}</b><span class="xn">${p.name}</span><span class="xh">${p.hanja}</span>`;
    el.tags.appendChild(d);
    return d;
  });
  const lostEls = [1, 2, 3].map(() => {
    const d = document.createElement('div');
    d.className = 'tag lost';
    d.innerHTML = '<b>亡失</b><span>행방불명</span>';
    el.tags.appendChild(d);
    return d;
  });
  const xSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  xSvg.setAttribute('class', 'xlines');
  el.tags.prepend(xSvg);
  const xLines = parts.map(() => {
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    xSvg.appendChild(l);
    return l;
  });

  let mode = 'stone';
  let brickStats = null;
  let lastActive = -2;
  let lastCard = '';

  function setMode(m, stats) {
    mode = m;
    brickStats = stats || brickStats;
    lastActive = -2; // re-render the callout's spec rows (stone vs brick counts)
    lastCard = '';
    el.edition.textContent = m === 'brick'
      ? `브릭 에디션 · 축척 1:10 (1 스터드 = 8 cm)${brickStats ? ` · 브릭 ${int(brickStats.total)}개` : ''}`
      : `정밀 석재 모델 · 부재 ${N}종 ${pieceCount}점 · 높이 10.29 m`;
  }

  const v = new THREE.Vector3();
  const project = (p, cam, W, H) => {
    v.copy(p).project(cam);
    return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, ok: v.z < 1 && v.z > -1 };
  };

  function specRows(p) {
    const s = p.size;
    const rows = [
      ['규격', `${fmt(s.x)} × ${fmt(s.z)} × ${fmt(s.y)} m`],
      ['체적', `${fmt(p.volume, 3)} m³`],
      ['중량', `${fmt(p.mass, 2)} t`],
      ['부재', `${p.pieces.length}점`],
    ];
    if (mode === 'brick' && p.brick) rows[3] = ['브릭', `${int(p.brick.bricks)}개 · 스터드 ${int(p.brick.studs)}`];
    return rows.map(([k, val]) => `<div><dt>${k}</dt><dd>${val}</dd></div>`).join('');
  }

  function update(t, camera, W, H, partCenters, lionGhosts) {
    const st = ch.stage(t);
    const act = ch.activePart(t);
    const removed = parts.filter((p) => t >= p.tLand - 0.2).length;
    const shownRemoved = st === 'dis' || st === 'mandala' ? removed : st === 'intro' ? 0 : N;
    el.cntNow.textContent = String(shownRemoved).padStart(2, '0');
    const massGone = parts.filter((p) => t >= p.tLand - 0.2).reduce((s, p) => s + p.mass, 0);
    el.cntMeta.textContent = mode === 'brick' && brickStats
      ? `브릭 ${int(parts.filter((p) => t >= p.tLand - 0.2).reduce((s, p) => s + (p.brick ? p.brick.bricks : 0), 0))} / ${int(brickStats.total)}`
      : `중량 ${fmt(st === 'dis' || st === 'mandala' ? massGone : st === 'intro' ? 0 : totalMass, 1)} / ${fmt(totalMass, 1)} t`;

    // Ledger status
    el.ledger.forEach((li, i) => {
      const p = parts[i];
      const state = t < p.t0 - 0.05 || st === 'end' || st === 'assemble' ? '' : i === act ? 'on' : t >= p.tLand - 0.2 ? 'done' : '';
      if (li.dataset.s !== state) { li.dataset.s = state; li.className = state; }
    });

    // Callout
    const calloutOn = st === 'dis' && act >= 0;
    const cOp = calloutOn ? Math.min(smooth((t - parts[act].t0 + 0.05) / 0.35), 1 - smooth((t - parts[act].tLand - 0.1) / 0.4)) : 0;
    el.callout.style.opacity = cOp.toFixed(3);
    if (act !== lastActive && act >= 0) {
      const p = parts[act];
      el.cNo.textContent = `DB-${p.no}`;
      el.cPhase.textContent = `${PHASES[p.phase].name} ${PHASES[p.phase].hanja}`;
      el.cName.textContent = p.name;
      el.cHan.textContent = p.hanja;
      el.cEn.textContent = p.en;
      el.cDesc.textContent = p.desc;
      el.cSpec.innerHTML = specRows(p);
      lastActive = act;
    }

    // Leader from the callout to the moving member
    if (cOp > 0.01 && partCenters[act]) {
      const sp = project(partCenters[act], camera, W, H);
      const r = el.callout.getBoundingClientRect();
      if (r.right + 80 > W) {
        // full-width callout (phones): rise from its top edge instead
        const x0 = Math.min(Math.max(sp.x, r.left + 24), r.right - 24), y0 = r.top - 8;
        el.line.setAttribute('points', `${x0},${y0} ${sp.x},${sp.y}`);
      } else {
        const x0 = r.right + 10, y0 = r.top + 26;
        const xm = Math.max(x0 + 24, Math.min(sp.x - 40, x0 + 90));
        el.line.setAttribute('points', `${x0},${y0} ${xm},${y0} ${sp.x},${sp.y}`);
      }
      el.dot.setAttribute('cx', sp.x); el.dot.setAttribute('cy', sp.y);
      el.pin.setAttribute('cx', sp.x); el.pin.setAttribute('cy', sp.y);
      el.leader.style.opacity = cOp.toFixed(3);
    } else el.leader.style.opacity = '0';

    // Bay tags
    const tagPhase = st === 'dis' || st === 'mandala';
    const mandala = st === 'mandala' ? smooth((t - ch.disEnd) / 1.2) : 0;
    const tagFade = st === 'explode' ? 1 - smooth((t - ch.E0) / 0.8) : 1;
    parts.forEach((p, i) => {
      const d = tagEls[i];
      const on = (tagPhase || st === 'explode') && t >= p.tLand - 0.25;
      if (!on) { if (d.style.opacity !== '0') d.style.opacity = '0'; return; }
      const sp = project(p.bay.center, camera, W, H);
      const hot = i === act ? 1 : 0;
      d.style.transform = `translate(${sp.x.toFixed(1)}px, ${sp.y.toFixed(1)}px)`;
      d.style.opacity = (smooth((t - p.tLand + 0.25) / 0.5) * (0.62 + 0.38 * Math.max(hot, mandala)) * tagFade * (sp.ok ? 1 : 0)).toFixed(3);
      d.classList.toggle('hot', hot === 1);
      d.classList.toggle('big', mandala > 0.5);
    });

    // Missing lions
    const lion = parts.findIndex((p) => p.name === '돌사자');
    const lionOp = lion >= 0 ? Math.min(smooth((t - parts[lion].t0 + 1.4) / 0.5), 1 - smooth((t - parts[lion].tLand) / 0.6)) : 0;
    lostEls.forEach((d, i) => {
      const sp = project(lionGhosts[i], camera, W, H);
      d.style.transform = `translate(${sp.x.toFixed(1)}px, ${sp.y.toFixed(1)}px)`;
      d.style.opacity = (lionOp * (sp.ok ? 1 : 0)).toFixed(3);
    });

    // Exploded labels
    const xOp = st === 'explode' ? smooth((t - ch.expSettled + 1.4) / 1.0) * (1 - smooth((t - ch.C0 + 0.2) / 0.5)) : 0;
    if (xOp > 0.005) {
      const pts = parts.map((p, i) => ({ i, sp: project(partCenters[i], camera, W, H) }));
      const cx = pts.reduce((s, q) => s + q.sp.x, 0) / pts.length;
      const sides = [[], []];
      pts.forEach((q) => sides[(N - 1 - q.i) % 2].push(q));
      const gap = Math.max(20, Math.min(34, H / 30));
      sides.forEach((list, s) => {
        list.sort((a, b) => a.sp.y - b.sp.y);
        let prev = -1e9;
        for (const q of list) {
          q.ly = Math.max(q.sp.y, prev + gap);
          prev = q.ly;
        }
        const over = prev - (H - 90);
        if (over > 0) for (const q of list) q.ly -= over;
        const lx = s === 0 ? cx + Math.min(W * 0.2, 380) : cx - Math.min(W * 0.2, 380);
        for (const q of list) {
          const d = xEls[q.i];
          d.classList.toggle('left', s === 1);
          d.style.transform = `translate(${lx.toFixed(1)}px, ${q.ly.toFixed(1)}px)`;
          d.style.opacity = xOp.toFixed(3);
          const edge = s === 0 ? lx - 8 : lx + 8;
          xLines[q.i].setAttribute('points', `${q.sp.x.toFixed(1)},${q.sp.y.toFixed(1)} ${(edge + (s === 0 ? -26 : 26)).toFixed(1)},${q.ly.toFixed(1)} ${edge.toFixed(1)},${q.ly.toFixed(1)}`);
        }
      });
      xSvg.style.opacity = xOp.toFixed(3);
    } else {
      if (xSvg.style.opacity !== '0') {
        xSvg.style.opacity = '0';
        xEls.forEach((d) => (d.style.opacity = '0'));
      }
    }

    // Phase banners
    let bOp = 0;
    let bIdx = -1;
    ch.phaseStarts.forEach((ps, i) => {
      const o = Math.min(smooth((t - ps + 0.2) / 0.45), 1 - smooth((t - ps - 2.1) / 0.6));
      if (o > bOp) { bOp = o; bIdx = i; }
    });
    let bannerKey = '';
    if (bIdx >= 0) bannerKey = `p${bIdx}`;
    const mandOp = st === 'mandala' ? Math.min(smooth((t - ch.disEnd - 0.2) / 0.6), 1 - smooth((t - ch.E0 + 0.7) / 0.5)) : 0;
    const expOp = st === 'explode' ? Math.min(smooth((t - ch.E0 - 0.3) / 0.6), 1 - smooth((t - ch.E0 - 3.2) / 0.6)) : 0;
    if (mandOp > bOp) { bOp = mandOp; bannerKey = 'm'; }
    if (expOp > bOp) { bOp = expOp; bannerKey = 'x'; }
    if (el.banner.dataset.k !== bannerKey) {
      el.banner.dataset.k = bannerKey;
      if (bannerKey.startsWith('p')) {
        const ph = PHASES[bIdx];
        const count = parts.filter((p) => p.phase === bIdx).length;
        el.bRoman.textContent = `PHASE ${ph.roman}`;
        el.bName.innerHTML = `${ph.name} 해체 <span>${ph.hanja}</span>`;
        el.bSub.textContent = `${ph.en} · ${count} members`;
      } else if (bannerKey === 'm') {
        el.bRoman.textContent = 'LAY-DOWN YARD';
        el.bName.innerHTML = `해체 완료 <span>解體</span>`;
        el.bSub.textContent = `부재 ${N}종 ${pieceCount}점 · 총 ${fmt(totalMass, 1)} t · 나선형 적치`;
      } else if (bannerKey === 'x') {
        el.bRoman.textContent = 'EXPLODED VIEW';
        el.bName.innerHTML = `분해도 <span>分解圖</span>`;
        el.bSub.textContent = '상륜부 · 탑신부 · 기단부 — 수직 축 정렬';
      }
    }
    el.banner.style.opacity = bOp.toFixed(3);

    // Title / end card
    let cardOp = 0;
    let card = '';
    if (st === 'intro') {
      cardOp = Math.min(smooth((t - 0.4) / 1.0), 1 - smooth((t - ch.T_INTRO + 1.5) / 1.0));
      card = 'intro';
    } else if (st === 'end') {
      cardOp = smooth((t - ch.assembled - 0.4) / 1.2);
      card = 'end';
    }
    if (card && card !== lastCard) {
      lastCard = card;
      el.card.className = `card ${card}`;
      el.card.innerHTML = card === 'intro'
        ? `<div class="k-eyebrow">國寶 · 慶州 佛國寺 多寶塔</div>
           <div class="k-han">多寶塔</div>
           <div class="k-ko">다보탑 해체 기록</div>
           <div class="k-rule"></div>
           <div class="k-meta">높이 10.29 m · 통일신라 751 · 부재 ${N}종 ${pieceCount}점 · ${mode === 'brick' ? '브릭 에디션' : '정밀 석재 모델'}</div>`
        : `<div class="k-han">多寶塔</div>
           <div class="k-ko">천이백칠십여 년의 돌</div>
           <div class="k-rule"></div>
           <p class="k-note">1925년경 해체·보수 이후 한 세기. 반출된 돌사자 3구와 탑 속 사리장엄구는 아직 돌아오지 않았다.</p>
           <div class="k-meta">절차적 3D 복원 · three.js · 부재 치수는 사진 비례에 근거한 추정치</div>`;
    }
    el.card.style.opacity = cardOp.toFixed(3);

    // Chrome fades out during the title cards
    const chrome = st === 'intro' ? smooth((t - ch.T_INTRO + 1.0) / 0.8) : st === 'end' ? 1 - smooth((t - ch.assembled - 0.2) / 0.8) : 1;
    for (const e of [el.brand, el.counter, el.ledgerBox]) e.style.opacity = chrome.toFixed(3);

    // Timeline
    const f = Math.min(1, t / ch.END);
    el.fill.style.width = `${(f * 100).toFixed(2)}%`;
    el.head.style.left = `${(f * 100).toFixed(2)}%`;
    el.tc.textContent = `${mmss(t)} / ${mmss(ch.END)}`;
  }

  return { update, setMode, controls: $('#controls', root), track: $('#track', root) };
}
