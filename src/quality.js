/**
 * Quality tiers.
 *
 * `pickTier` makes an opening guess from what the device tells us, then
 * `FrameWatch` keeps an eye on real frame times and steps down a tier if the
 * guess was optimistic. It never steps back up: oscillating between tiers is
 * far more noticeable than simply running one notch below perfect.
 */

const TIER_ORDER = ['low', 'medium', 'high'];

/**
 * @returns {{tier: string, pinned: boolean}} `pinned` means the tier was asked
 * for explicitly, so the frame watcher should leave it alone.
 */
export function pickTier(CONFIG) {
  // ?tier=high|medium|low forces a tier — handy for checking how the scene
  // looks on hardware you don't have in front of you
  const asked = new URLSearchParams(location.search).get('tier');
  if (asked && TIER_ORDER.includes(asked)) return { tier: asked, pinned: true };

  if (CONFIG.forceTier) return { tier: CONFIG.forceTier, pinned: true };

  return { tier: guessTier(), pinned: false };
}

function guessTier() {
  const nav = navigator;
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent || '');
  const cores = nav.hardwareConcurrency || (isMobile ? 4 : 8);
  const mem = nav.deviceMemory || (isMobile ? 4 : 8);

  // The GPU string is the single most useful signal when we can get it.
  let gpu = '';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '') || '';
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    }
  } catch { /* blocked by privacy settings — fall through to the heuristics */ }

  const g = gpu.toLowerCase();

  // Software rasterisers can't handle the reflection pass at any size.
  if (/swiftshader|llvmpipe|software|basic render/.test(g)) return 'low';

  // Desktop discrete / Apple silicon
  if (/nvidia|geforce|radeon rx|apple m\d/.test(g)) return 'high';

  if (isMobile) {
    // Recent Apple mobile GPUs comfortably run the reflection pass.
    if (/apple a1[4-9]|apple a2\d/.test(g)) return 'high';
    if (/adreno \(tm\) [67]\d\d|mali-g[78]\d/.test(g)) return 'high';
    if (cores >= 6 && mem >= 4) return 'medium';
    return 'low';
  }

  if (cores >= 8 && mem >= 8) return 'high';
  return 'medium';
}

export function lowerTier(tier) {
  const i = TIER_ORDER.indexOf(tier);
  return i > 0 ? TIER_ORDER[i - 1] : tier;
}

/**
 * Rolling frame-time watcher. Reports a downgrade when a whole window of
 * frames comes in consistently slow, so a single hitch (a GC pause, the tab
 * regaining focus) never triggers it.
 */
export class FrameWatch {
  constructor({ windowSize = 120, budgetMs = 26, graceMs = 2500 } = {}) {
    this.windowSize = windowSize;
    this.budgetMs = budgetMs;
    this.samples = [];
    this.startedAt = performance.now();
    this.graceMs = graceMs;
  }

  /** @returns {boolean} true when the scene should drop a tier */
  sample(dtMs) {
    // ignore the first couple of seconds: shader compilation lives there
    if (performance.now() - this.startedAt < this.graceMs) return false;
    if (dtMs > 400) return false;            // tab was backgrounded, not slow

    this.samples.push(dtMs);
    if (this.samples.length < this.windowSize) return false;

    this.samples.sort((a, b) => a - b);
    const median = this.samples[this.samples.length >> 1];
    this.samples.length = 0;
    this.startedAt = performance.now();      // fresh grace period after a change

    return median > this.budgetMs;
  }
}
