import {
  DISCOVERIES, COLLECTIONS, COSMETICS, TITLES, RARITY,
  discoveriesOf, title, cosmetic, describeEarn,
} from './discoveries.js';
import { paintEmblem } from './shapes.js';

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
    render(true);
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

      /* The moods this world can be found in. Only shown once there is more
         than the one you started with, so a player who has not unlocked
         anything never sees a row of locked things they cannot use. */
      const moods = archive.variants(w.key);
      if (moods.some((v) => v.unlocked && !v.default)) {
        const seg = el('j-moods');
        for (const v of moods) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `j-mood${v.chosen ? ' on' : ''}${v.unlocked ? '' : ' locked'}`;
          b.disabled = !v.unlocked;
          b.textContent = v.unlocked ? v.name : '—';
          b.title = v.unlocked ? v.note : 'Know this world better.';
          if (v.unlocked) {
            b.addEventListener('click', () => {
              archive.setVariant(w.key, v.id);
              onEquip?.('variant', v.id);
              render();
            });
          }
          seg.appendChild(b);
        }
        card.appendChild(seg);
        const chosen = moods.find((v) => v.chosen);
        if (chosen) card.appendChild(el('j-note', chosen.note));
      }

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

        /* The emblem, drawn from the same numbers as the solid standing out
           there in the grass. An unfound one is the identical drawing at a
           lower opacity — which is the point: the silhouette is the hint, and
           a row of shapes you have not found yet is a far better reason to go
           and look than a row of question marks would be. */
        const em = el('j-mem-emblem');
        em.style.setProperty('--r-glow', String(RARITY[d.rarity]?.glow ?? 1));
        paintEmblem(em, d.shape);
        item.appendChild(em);

        const txt = el('j-mem-text');
        // An unfound memory keeps its name back. What it shows instead is its
        // form, its rarity and the fact that it exists — enough to be worth
        // going to look for, never enough to be a checklist with directions.
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

  /**
   * Everything you have been given, and everything you have not.
   *
   * A badge rather than a button with a name on it: its own emblem, how much
   * of an achievement it is, and the exact condition that earned it — or, if
   * it has not been earned, the same condition written as an invitation, with
   * how far along you are whenever that is a thing you can count. A locked
   * entry that says "not yet earned" and nothing else, which is what this used
   * to be, tells you neither what it is nor how to get it.
   */
  function renderWanderer() {
    const out = el('j-page');

    out.appendChild(badgesFor('title', 'titles', TITLES));
    out.appendChild(badgesFor('cloak', 'cloaks', COSMETICS.cloak));
    out.appendChild(badgesFor('companion', 'companions', COSMETICS.companion));

    const locked = countLocked();
    if (locked > 0) {
      out.appendChild(el('j-quiet',
        `${locked} more ${locked === 1 ? 'thing is' : 'things are'} out there to be earned. `
        + 'None of them are going anywhere.'));
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

  /** a world key as the player knows it, for the lines on a badge */
  const worldName = (key) => worlds.find((w) => w.key === key)?.name || key;

  function badgesFor(kind, label, all) {
    const block = el('j-block');
    block.appendChild(el('j-label', label));

    const list = el('j-badges');
    for (const c of all) {
      const b = archive.badge(kind, c.id);
      if (!b) continue;

      const row = document.createElement('button');
      row.type = 'button';
      row.className = `j-badge w-${b.weight}`
        + (b.worn ? ' worn' : '') + (b.owned ? '' : ' locked');
      row.disabled = !b.owned;

      const em = el('j-badge-emblem');
      paintEmblem(em, b.emblem);
      row.appendChild(em);

      const txt = el('j-badge-text');
      const top = el('j-badge-top');
      top.appendChild(el('j-badge-name', b.name));
      // what it is worth, said once, quietly
      top.appendChild(el('j-badge-weight', b.worn ? 'worn' : b.weight));
      txt.appendChild(top);

      /* Earned: what it is. Not earned: what would earn it. The default has no
         condition to state — it was never earned, it was where you started. */
      const how = b.owned
        ? b.note
        : (describeEarn(b.condition, worldName) || b.note || 'Keep going.');
      txt.appendChild(el('j-badge-note', how));

      // ...and how close, when it is a thing that can be counted
      if (!b.owned && b.progress && b.progress.need > 0) {
        txt.appendChild(meter(b.progress.ratio));
        txt.appendChild(el('j-badge-progress', progressText(b.condition, b.progress)));
      }

      row.appendChild(txt);

      if (b.owned) {
        row.addEventListener('click', () => {
          archive.equip(kind, c.id);
          onEquip?.(kind, c.id);
          render();
        });
      }
      list.appendChild(row);
    }
    block.appendChild(list);
    return block;
  }

  /**
   * "3 of 8" for a count, "40% of 75%" for a proportion.
   *
   * Clamped, because a badge that is still locked can only be showing
   * progress it has not finished — reading past its own target would look
   * like the game had lost count.
   */
  function progressText(cond, p) {
    const have = Math.min(p.have, p.need);
    const proportional = cond
      && (cond.completion !== undefined || cond.mastery !== undefined);
    return proportional
      ? `${pct(have)} of ${pct(p.need)}`
      : `${Math.floor(have)} of ${p.need}`;
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

    /* Who you are, on the one screen that shows you beside anyone else. The
       title is the only earned thing a profile carries, so it is shown here
       the way it is shown in the wanderer tab — as a badge, with its emblem —
       rather than as a name in small print. */
    profiles?.me().then((me) => {
      if (tab !== 'beside' || !me) return;
      const card = el('j-me');
      if (me.title) {
        const em = el('j-me-emblem');
        paintEmblem(em, me.title.emblem);
        card.appendChild(em);
      }
      const txt = el('j-me-text');
      txt.appendChild(el('j-me-name', me.name));
      if (me.title) txt.appendChild(el('j-me-title', me.title.name));
      card.appendChild(txt);
      out.insertBefore(card, out.firstChild?.nextSibling || null);
    });

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

  /**
   * @param toTop true when the page has actually changed — opening the
   *   archive, or moving to another tab.
   *
   * Equipping something re-renders the tab it is on, and those tabs are long:
   * the wanderer tab is well over two thousand pixels once every badge is in
   * it. Sending the view back to the top every time meant choosing a cloak
   * halfway down threw you up to the first title, which reads as the archive
   * having lost your place — so the scroll position is kept across a re-render
   * of the same page and only reset when the page is a different one.
   */
  function render(toTop = false) {
    for (const b of tabsEl.querySelectorAll('button')) {
      b.classList.toggle('on', b.dataset.tab === tab);
    }
    const was = bodyEl.scrollTop;
    bodyEl.textContent = '';
    bodyEl.appendChild(
      tab === 'worlds' ? renderWorlds()
      : tab === 'memories' ? renderMemories()
      : tab === 'wanderer' ? renderWanderer()
      : tab === 'beside' ? renderBeside()
      : renderJourney()
    );
    bodyEl.scrollTop = toTop ? 0 : was;
  }

  function show(which) {
    if (which) tab = which;
    open = true;
    render(true);
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
