// Usage: node probe.cjs <browserType> <url> <outdir>
const pw = require(process.env.PW || 'playwright');
(async () => {
  const [type, url, out] = process.argv.slice(2);
  const b = await pw[type].launch();
  const res = { browser: type };
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => (m.type() === 'error' || m.type() === 'warning') && errs.push(m.type() + ': ' + m.text()));
  await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(1800);
  res.features = await p.evaluate(() => ({
    scrollDrivenView: CSS.supports('animation-timeline: view()'),
    viewTransitions: typeof document.startViewTransition === 'function',
    detailsContent: CSS.supports('selector(::details-content)') && CSS.supports('interpolate-size: allow-keywords'),
    ioFallbackActive: document.documentElement.classList.contains('io'),
    heroAnimations: document.getAnimations().filter(a => a.animationName && /rise|draw|tick|drift/.test(a.animationName)).length,
  }));
  res.overflowPx = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  // scroll through the page; all pubs must end fully visible
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 300) { scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } });
  await p.waitForTimeout(900);
  await p.evaluate(() => document.getElementById('publications').scrollIntoView());
  await p.waitForTimeout(900);
  res.headerCondensed = await p.evaluate(() => document.querySelector('.site-head').classList.contains('scrolled'));
  res.navActive = await p.evaluate(() => (document.querySelector('nav a[aria-current]') || {}).textContent || null);
  res.navIndicatorOn = await p.evaluate(() => document.querySelector('.nav-ind').classList.contains('on'));
  res.pubOpacities = await p.evaluate(() => [...document.querySelectorAll('.pub')].map(e => { e.scrollIntoView({ block: 'center' }); return null; }));
  await p.waitForTimeout(700);
  res.pubOpacities = await p.evaluate(async () => { const o = []; for (const e of document.querySelectorAll('.pub')) { e.scrollIntoView({ block: 'center' }); await new Promise(r => setTimeout(r, 400)); o.push(+getComputedStyle(e).opacity); } return o; });
  // filters
  await p.evaluate(() => document.querySelector('.toolbar').scrollIntoView({ block: 'center' })); await p.waitForTimeout(400);
  await p.evaluate(() => { window.__vt = []; const o = document.startViewTransition.bind(document); document.startViewTransition = cb => { const t = o(cb); const r = { ready: 'pending', finished: 'pending', t0: performance.now() }; window.__vt.push(r); t.ready.then(() => r.ready = Math.round(performance.now() - r.t0) + 'ms', e => r.ready = 'rejected:' + e.name); t.finished.then(() => r.finished = Math.round(performance.now() - r.t0) + 'ms', e => r.finished = 'rejected:' + e.name); return t; }; });
  res.hitTarget = await p.evaluate(() => { const b = document.querySelector('button[data-filter="lead"]').getBoundingClientRect(); const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return el && (el.dataset.filter || el.className || el.tagName); });
  await p.click('button[data-filter="lead"]'); await p.waitForTimeout(700);
  res.leadPressed = await p.evaluate(() => document.querySelector('button[data-filter="lead"]').getAttribute('aria-pressed'));
  res.filterLead = await p.evaluate(() => [document.querySelectorAll('.pub:not([hidden])').length, document.querySelector('#pub-count').textContent.trim(), document.getElementById('pub-live').textContent]);
  await p.click('button[data-filter="preprint"]'); await p.waitForTimeout(700);
  res.filterPre = await p.evaluate(() => [document.querySelectorAll('.pub:not([hidden])').length, document.querySelector('#pub-count').textContent.trim()]);
  await p.click('button[data-filter="all"]'); await p.waitForTimeout(700);
  res.filterAll = await p.evaluate(() => document.querySelectorAll('.pub:not([hidden])').length);
  res.filterTransitions = await p.evaluate(() => window.__vt);
  // details
  await p.click('.pub .bib summary'); await p.waitForTimeout(500);
  res.bibOpenHeight = await p.evaluate(() => Math.round(document.querySelector('.bib .bib-body').getBoundingClientRect().height));
  // theme toggle
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(300);
  await p.click('.theme-toggle'); await p.waitForTimeout(900);
  res.themeAfterToggle = await p.evaluate(() => document.documentElement.dataset.theme);
  res.namesCleared = await p.evaluate(() => [...document.querySelectorAll('.pub')].every(e => !e.style.viewTransitionName));
  res.consoleErrors = errs;
  await ctx.close();
  // reduced motion
  const rc = await b.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: 'reduce' });
  const rp = await rc.newPage(); await rp.goto(url, { waitUntil: 'load' }); await rp.waitForTimeout(500);
  res.reducedMotion = await rp.evaluate(() => ({ runningAnimations: document.getAnimations().length, pubsVisible: [...document.querySelectorAll('.pub')].every(e => getComputedStyle(e).opacity === '1') }));
  
  await rc.close();
  // no JS
  const nc = await b.newContext({ viewport: { width: 1280, height: 860 }, javaScriptEnabled: false });
  const np = await nc.newPage(); await np.goto(url, { waitUntil: 'load' }); await np.waitForTimeout(1600);
  res.noJs = await np.evaluate(() => ({ pubs: document.querySelectorAll('.pub').length, pubsVisible: [...document.querySelectorAll('.pub')].every(e => getComputedStyle(e).opacity === '1'), filtersHidden: document.querySelector('.filters').hidden }));
  await nc.close();
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})();
