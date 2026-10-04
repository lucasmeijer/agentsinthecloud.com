// Requires Playwright. Serve the repo, then run:
// STORY_URL=http://localhost:8000 node tests/story-performance.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const url = process.env.STORY_URL || 'http://localhost:8000';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function seek(page, time) {
  await page.evaluate(t => {
    const s = window.__story;
    window.scrollTo(0, s.st.start + (s.st.end - s.st.start) * t / s.tl.duration());
  }, time);
  await wait(700); // allow the scroll scrub to settle
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    for (const mobile of [true, false]) {
      const page = await browser.newPage(mobile ? {
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
        isMobile: true, hasTouch: true,
      } : { viewport: { width: 1440, height: 900 } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      // Isolate the story from third-party video/network activity.
      await page.route('**/www.tella.tv/**', route => route.abort());
      await page.goto(url);
      await page.evaluate(() => document.fonts.ready);
      for (const time of [0, 1, 3, 7, 14, 19, 26, 28, 32, 37, 39, 40, 44, 50, 51, 26, 14, 3, 0]) {
        await seek(page, time);
        const geometry = await page.evaluate(() => {
          const stage = document.querySelector('#stage');
          const box = document.querySelector('.captions');
          const vb = stage.viewBox.baseVal;
          const k = Math.min(stage.clientWidth / vb.width, stage.clientHeight / vb.height);
          const expected = (stage.clientHeight - vb.height * k) / 2 + (925 - window.__story.camY()) * k; // portrait pans a group, not the viewBox
          return {
            captionError: Math.abs(box.getBoundingClientRect().top - stage.getBoundingClientRect().top - expected),
            grain: getComputedStyle(stage.querySelector('[filter="url(#paint-grain)"]')).filter,
          };
        });
        assert(geometry.captionError < 1, `Caption alignment at ${time}: ${geometry.captionError}`);
        assert.equal(geometry.grain === 'none', mobile);
        // GSAP animates CSS opacity, leaving the initial SVG opacity attribute at 0.
        // Such groups must not be hidden by an attribute-based visibility rule.
        if (time === 50 || time === 37) {
          const visible = await page.evaluate(t => {
            const selector = t === 50
              ? '#layer-badges image[href="/assets/agents-in-the-cloud.webp"][width="1010"]'
              : '#layer-closet image[href="/assets/workshop-closet.png"]';
            const image = document.querySelector(selector);
            let opacity = 1;
            for (let node = image; node && node.id !== 'stage'; node = node.parentElement) {
              const style = getComputedStyle(node);
              if (style.visibility === 'hidden' || style.display === 'none') return false;
              opacity *= Number(style.opacity);
            }
            return opacity > 0.9;
          }, time);
          assert(visible, `Artwork must be visible at ${time}`);
        }
      }
      await page.setViewportSize(mobile ? { width: 430, height: 932 } : { width: 1200, height: 800 });
      await wait(700);
      await page.evaluate(() => {
        window.storyCounts = { writes: 0, geometry: 0, rects: 0 };
        const wrap = (object, key, counter) => {
          const original = object[key];
          object[key] = function (...args) {
            window.storyCounts[counter]++;
            return original.apply(this, args);
          };
        };
        wrap(Element.prototype, 'setAttribute', 'writes');
        wrap(SVGGeometryElement.prototype, 'getTotalLength', 'geometry');
        wrap(SVGGeometryElement.prototype, 'getPointAtLength', 'geometry');
        wrap(Element.prototype, 'getBoundingClientRect', 'rects');
      });
      await wait(500);
      assert.equal(await page.evaluate(() => storyCounts.writes), 0, 'Idle SVG must not be rewritten');
      await seek(page, 0.5);
      assert.equal(await page.evaluate(() => storyCounts.rects), 0, 'Camera must not remeasure caption arrows');
      await seek(page, 19);
      assert.equal(await page.evaluate(() => storyCounts.geometry), 0, 'Packets must not query SVG geometry');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await wait(1000);
      await page.evaluate(() => { storyCounts.writes = 0; });
      await wait(500);
      assert.equal(await page.evaluate(() => storyCounts.writes), 0, 'Offscreen story must stop rendering');
      assert.deepEqual(errors, [], 'No story JavaScript errors');
      console.log(`${mobile ? 'Mobile' : 'Desktop'}: forward/reverse, resize, filters, captions, idle/offscreen, geometry checks passed`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
