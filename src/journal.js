import {
  DISCOVERIES, COLLECTIONS, COSMETICS, TITLES, RARITY,
  discoveriesOf, title, cosmetic,
} from './discoveries.js';

/**
 * The Dream Archive, as a page you can open.
 *
 * All DOM. It is built once, hidden, and refreshed only when it is opened or
 * a tab is changed — it must never do work while the world is being rendered,
 * which is the entire reason the collection lives in HTML rather than in the
 * scene.
 *
 * The tone rule the whole thing is written to: an undiscovered memory shows
 * its shape but not its name. A row of unnamed things you have not found is
 * the single most effective thing in the game at making someone go and look,
 * and it costs nothing and pressures no one.
 */
export function createJournal({
  archive, worlds, leaderboard, profiles, onClose, onEquip, onTab,
  inSanctuary, onSanctuary,
}) {
  const root = document.getElementById('journal');
  const bodyEl = root.querySelector('.j-body');
  const tabsEl = root.querySelector('.j-tabs');
  const closeEl = root.querySelector('.j-close');

  let tab = 'journey';
  let open = false;

  const TABS = [
    ['journey', 'journey'],
    ['worlds', 'worlds'],
    ['memories', 'memories'],
    ['wanderer', 'wanderer'],
    ['beside', 'beside'],
  ];

  for (const [id, label] of TABS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.tab = id;
    b.textContent = label;
    tabsEl.appendChild(b);
  }

  tabsEl.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    onTab?.(tab);
    render();
  });

  closeEl.addEventListener('click', () => hide());
  root.addEventListener('click', (e) => { if (e.target === root) hide(); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) hide();
  });

  /* ── little builders ─────────────────────────────────────────────────── */

  const el = (cls, text) => {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    if (text !== undefined) d.textContent = text;
    return d;
  };

  /** a proportion, drawn as a line of light rather than a progress bar */
  function meter(value) {
    const wrap = el('j-meter');
    const fill = el('j-meter-fill');
    fill.style.width = `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
    wrap.appendChild(fill);
    return wrap;
  }

  function stat(label, value, sub) {
    const s = el('j-stat');
    s.appendChild(el('j-stat-v', value));
    s.appendChild(el('j-stat-l', label));
    if (sub) s.appendChild(el('j-stat-s', sub));
    return s;
  }

  const pct = (v) => `${Math.round(v * 100)}%`;

  /* ── journey ─────────────────────────────────────────────────────────── */

  function renderJourney() {
    const s = archive.summary();
    const out = el('j-page');

    const head = el('j-hero');
    head.appendChild(el('j-hero-title', title(archive.equipped('title'))?.name || 'The Wanderer'));
    head.appendChild(el('j-hero-sub',
      s.discoveries === 0
        ? 'Nothing found yet. There is a great deal out there.'
        : `${s.discoveries} ${s.discoveries === 1 ? 'memory' : 'memories'} kept.`));
    out.appendChild(head);

    const grid = el('j-stats');
    grid.appendChild(stat('memories', `${s.discoveries}`, `of ${s.ofDiscoveries}`));
    grid.appendChild(stat('rare finds', `${s.rare}`));
    grid.appendChild(stat('collections', `${s.collections}`, `of ${s.ofCollections}`));
    grid.appendChild(stat('worlds seen', `${s.worldsVisited}`, `of ${s.ofWorlds}`));
    out.appendChild(grid);

    const m = el('j-block');
    m.appendChild(el('j-label', 'the journey, entire'));
    m.appendChild(meter(s.completion));
    m.appendChild(el('j-note', `${pct(s.completion)} of everything there is to find.`));
    out.appendChild(m);

    const mm = el('j-block');
    mm.appendChild(el('j-label', 'how well the worlds are known'));
    mm.appendChild(meter(s.mastery));
    mm.appendChild(el('j-note', `${pct(s.mastery)} across all four.`));
    out.appendChild(mm);

    // the way home. The only button in the archive that goes anywhere.
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'j-go';
    const home = inSanctuary?.();
    go.textContent = home ? 'back to the journey' : 'visit your sanctuary';
    go.addEventListener('click', () => onSanctuary?.());
    out.appendChild(go);

    out.appendChild(el('j-quiet',
      'Nothing here expires, and nothing is lost by staying away. '
      + 'The worlds keep what you left in them.'));
    return out;
  }

  /* ── worlds ──────────────────────────────────────────────────────────── */

  function renderWorlds() {
    const out = el('j-page');
    for (const w of worlds) {
      const m = archive.mastery(w.key);
      const card = el('j-world');
      card.style.setProperty('--w-accent',
        '#' + (w.palette.fractalHigh).toString(16).padStart(6, '0'));

      const top = el('j-world-top');
      top.appendChild(el('j-world-name', w.name));
      top.appendChild(el('j-world-pct', pct(m.value)));
      card.appendChild(top);
      card.appendChild(meter(m.value));

      const rows = el('j-rows');
      rows.appendChild(row('awakened', `${m.awakened} / ${m.ofStructures}`));
      rows.appendChild(row('memories', `${m.found} / ${m.ofDiscoveries}`));
      rows.appendChild(row('monument', pct(Math.min(1, m.delivered / m.ofMonument))));
      rows.appendChild(row('visits', m.visits === 0 ? 'not yet' : `${m.visits}`));
      card.appendChild(rows);

      const form = archive.monumentForm(w.key);
      card.appendChild(el('j-note', `The monument stands ${form.name.toLowerCase()}.`));
      out.appendChild(card);
    }
    return out;
  }

  function row(label, value) {
    const r = el('j-row');
    r.appendChild(el('j-row-l', label));
    r.appendChild(el('j-row-v', value));
    return r;
  }

  /* ── memories ────────────────────────────────────────────────────────── */

  function renderMemories() {
    const out = el('j-page');

    for (const w of worlds) {
      const list = discoveriesOf(w.key);
      if (!list.length) continue;
      const found = archive.foundIn(w.key);

      const sec = el('j-block');
      const top = el('j-world-top');
      top.appendChild(el('j-world-name', w.name));
      top.appendChild(el('j-world-pct', `${found.length} / ${list.length}`));
      sec.appendChild(top);

      const set = COLLECTIONS.find((c) => c.world === w.key);
      if (set) {
        const done = set.members.every((id) => found.includes(id));
        sec.appendChild(el('j-set' + (done ? ' done' : ''),
          done ? `${set.name} — complete` : set.name));
      }

      for (const d of list) {
        const has = found.includes(d.id);
        const item = el(`j-mem ${has ? 'found' : 'unfound'} r-${d.rarity}`);
        const dot = el('j-mem-dot');
        dot.style.setProperty('--r-glow', String(RARITY[d.rarity]?.glow ?? 1));
        item.appendChild(dot);

        const txt = el('j-mem-text');
        // An unfound memory keeps its name. What it shows instead is its
        // rarity and the fact that it exists — enough to be worth going to
        // look for, never enough to be a checklist with directions on it.
        txt.appendChild(el('j-mem-name', has ? d.name : '—'));
        txt.appendChild(el('j-mem-note',
          has ? d.note
            : d.needs ? 'Something has to be true first.'
            : 'Not yet found.'));
        item.appendChild(txt);
        item.appendChild(el('j-mem-rar', RARITY[d.rarity]?.label ?? ''));
        sec.appendChild(item);
      }
      out.appendChild(sec);
    }
    return out;
  }

  /* ── wanderer ────────────────────────────────────────────────────────── */

  function renderWanderer() {
    const out = el('j-page');

    out.appendChild(pickerFor('title', 'title', TITLES));
    out.appendChild(pickerFor('cloak', 'cloak', COSMETICS.cloak));
    out.appendChild(pickerFor('companion', 'companion', COSMETICS.companion));

    const locked = countLocked();
    if (locked > 0) {
      out.appendChild(el('j-quiet',
        `${locked} more ${locked === 1 ? 'thing is' : 'things are'} out there to be earned.`));
    }
    return out;
  }

  function countLocked() {
    let n = 0;
    for (const kind of ['cloak', 'companion']) {
      n += COSMETICS[kind].filter((c) => !archive.owns(kind, c.id)).length;
    }
    n += TITLES.filter((t) => !archive.owns('title', t.id)).length;
    return n;
  }

  function pickerFor(kind, label, all) {
    const block = el('j-block');
    block.appendChild(el('j-label', label));

    const list = el('j-picker');
    for (const c of all) {
      const owned = archive.owns(kind, c.id);
      const on = archive.equipped(kind) === c.id;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `j-pick${on ? ' on' : ''}${owned ? '' : ' locked'}`;
      b.disabled = !owned;

      b.appendChild(el('j-pick-name', owned ? c.name : 'not yet earned'));
      if (c.note) b.appendChild(el('j-pick-note', owned ? c.note : ' '));

      if (owned) {
        b.addEventListener('click', () => {
          archive.equip(kind, c.id);
          onEquip?.(kind, c.id);
          render();
        });
      }
      list.appendChild(b);
    }
    block.appendChild(list);
    return block;
  }

  /* ── beside ──────────────────────────────────────────────────────────
   *
   * Comparison, written as a gallery rather than a ranking. There is no
   * position number anywhere in here and nothing says how far behind anyone
   * is, because a bedtime game that can tell you that you are losing has
   * stopped being one. What it does say is what other journeys looked like,
   * which is the same curiosity the memories tab runs on.
   */
  function renderBeside() {
    const out = el('j-page');

    out.appendChild(el('j-quiet',
      'A quiet place to compare journeys. Nothing here is a race, '
      + 'and nobody is keeping score.'));

    if (!leaderboard) return out;

    // rendered from the promise; the panel is DOM and can wait a tick
    leaderboard.all().then((boards) => {
      if (tab !== 'beside') return;
      for (const b of boards) {
        const block = el('j-block');
        block.appendChild(el('j-label', b.category.name));
        block.appendChild(el('j-note', b.category.note));

        for (const e of b.entries) {
          const r = el('j-beside' + (e.me ? ' me' : ''));
          r.appendChild(el('j-beside-n', e.name));
          r.appendChild(el('j-beside-v', e.display));
          block.appendChild(r);
        }
        out.appendChild(block);
      }
      if (boards[0]?.local) {
        out.appendChild(el('j-quiet',
          'These other wanderers are examples, kept on this device. '
          + 'Nothing about your journey has been sent anywhere.'));
      }
    });

    return out;
  }

  /* ── rendering ───────────────────────────────────────────────────────── */

  function render() {
    for (const b of tabsEl.querySelectorAll('button')) {
      b.classList.toggle('on', b.dataset.tab === tab);
    }
    bodyEl.textContent = '';
    bodyEl.scrollTop = 0;
    bodyEl.appendChild(
      tab === 'worlds' ? renderWorlds()
      : tab === 'memories' ? renderMemories()
      : tab === 'wanderer' ? renderWanderer()
      : tab === 'beside' ? renderBeside()
      : renderJourney()
    );
  }

  function show(which) {
    if (which) tab = which;
    open = true;
    render();
    root.classList.add('open');
    root.setAttribute('aria-hidden', 'false');
  }

  function hide() {
    if (!open) return;
    open = false;
    root.classList.remove('open');
    root.setAttribute('aria-hidden', 'true');
    onClose?.();
  }

  return {
    show,
    hide,
    get open() { return open; },
    toggle() { open ? hide() : show(); },
  };
}
