"""Capture the demo video frames by driving the deployed app with browser-harness.

    browser-harness <<'EOF'
    exec(open('scripts/capture-demo-frames.py').read())
    EOF

Writes PNGs and a beats.json into `browser-tmp/frames`, which
`scripts/make-demo-video.py` turns into the published cut.
"""
import time, json, os

OUT = 'browser-tmp/frames'
os.makedirs(OUT, exist_ok=True)
URL = 'https://ak-blank.github.io/curvecraft'
beats = []

def shot(name, caption):
    src = capture_screenshot()
    dst = f'{OUT}/{name}.png'
    os.replace(src, dst)
    beats.append({'name': name, 'caption': caption})
    print('  captured', name)

def click_text(label, contains=True):
    b = js("""(() => {
      const el=[...document.querySelectorAll('button')].find(x=> %s);
      if(!el) return null; const q=el.getBoundingClientRect();
      if (q.width === 0) return null;
      return {x:Math.round(q.x+q.width/2), y:Math.round(q.y+q.height/2)};
    })()""" % (f"x.innerText.trim().includes({json.dumps(label)})" if contains else f"x.innerText.trim()==={json.dumps(label)}"))
    if not b:
        print('  ! not found:', label); return False
    click_at_xy(b['x'], b['y'])
    return True

def scroll_to(pattern, block='center'):
    ok = js("""(() => {
      const re = new RegExp(%s);
      const el = [...document.querySelectorAll('h1,h2,div')].find(e => re.test(e.innerText||'') && e.children.length < 6);
      if (!el) return false; el.scrollIntoView({block: %s}); return true;
    })()""" % (json.dumps(pattern), json.dumps(block)))
    time.sleep(0.6)
    # Some pages (the deployed /pools/ among them) ignore programmatic scrolling
    # entirely — scrollIntoView reports success and scrollY stays 0. A real wheel
    # event goes through the browser's own input path and always moves them.
    if js("window.scrollY") == 0 and block != 'start':
        for _ in range(8):
            cdp("Input.dispatchMouseEvent", type="mouseWheel", x=800, y=500, deltaX=0, deltaY=420)
            time.sleep(0.35)
    return ok

def scroll_top():
    js("window.scrollTo({top: 0})"); time.sleep(0.5)

cdp("Emulation.setDeviceMetricsOverride", width=1600, height=900, deviceScaleFactor=1, mobile=False)
new_tab(URL + '/studio/')
cdp("Emulation.setFocusEmulationEnabled", enabled=True)
wait_for_load()
print('loading the deployed studio (SDK + first simulation)…')
time.sleep(20)

scroll_top()
shot('01-studio', 'Compiled into a real Meteora DBC config with the official SDK')

# 2. sub-linear raise: double the graduation market cap
js("""(() => {
  const inputs=[...document.querySelectorAll('input[type=number]')];
  const el = inputs[3];
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
  setter.call(el, '16000');
  el.dispatchEvent(new Event('input', {bubbles:true}));
})()""")
time.sleep(7); scroll_top()
shot('02-double', 'Doubling the graduation target costs only 1.5x the raise')

# 3. curve shape
click_text('Flat'); time.sleep(8); scroll_top()
shot('03-flat', 'A flat curve reaches the same valuation with 27% less capital')

# 4. meme speedrun preset (fast exponential fee decay)
click_text('Meme Speedrun'); time.sleep(9); scroll_top()
shot('04-fees', 'Meme Speedrun: 20% fee decaying to 1% in thirty minutes')

# 5. scenarios
js("""(() => { const el=[...document.querySelectorAll('button')].find(x=>/Market cap path/i.test(x.innerText) || /Sniper wave/i.test(x.innerText)); if(el) el.scrollIntoView({block:'center'}); })()""")
time.sleep(1)
click_text('Sniper wave'); time.sleep(5)
shot('05-sniper', 'Sixty bots in the first ten seconds, then organic demand')
click_text('Whale buys'); time.sleep(5)
shot('06-whale', 'A whale takes a position, then dumps into the curve')

# 6. scoreboard
scroll_to('Scenario scoreboard'); time.sleep(1)
shot('07-scoreboard', 'The sniper premium: what each demand pattern really pays')

# 7. monte carlo
scroll_to('Graduation odds'); time.sleep(1)
click_text('500 runs'); time.sleep(12)
shot('08-montecarlo', '200 sampled demand paths give a graduation probability')

# 8. comparison
scroll_top()
for label in ['Deep Migration', 'Stablecoin Pair']:
    click_text(label)
    time.sleep(4)
time.sleep(10)
click_text('Meme Speedrun'); time.sleep(10)
scroll_to('Head to head'); time.sleep(1)
shot('09-compare', 'The same demand replayed against every design you selected')

# 9. launch check
scroll_to('Launch check'); time.sleep(1)
shot('10-lint', 'Every program rule checked before you deploy')

# 10. launch script
scroll_to('Show launch script', block='center')
click_text('Show launch script'); time.sleep(3)
scroll_to('Launch script'); time.sleep(1)
shot('11-script', 'Export the create-config transaction, then simulate it on mainnet')

# 11. presets marketplace
goto_url(URL + '/presets/'); wait_for_load(); time.sleep(8)
shot('12-presets', 'A preset marketplace with measured graduation odds')

# 12. live pools — wheel down past the measurement panel so this beat shows the
# pool list and the next beat can show the panel; otherwise both frames are the
# same screenshot.
goto_url(URL + '/pools/'); wait_for_load(); time.sleep(6)
for _ in range(6):
    cdp("Input.dispatchMouseEvent", type="mouseWheel", x=800, y=500, deltaX=0, deltaY=420)
    time.sleep(0.4)
time.sleep(1.5)
shot('13-pools', 'Live mainnet DBC pools, read straight from the program')

# 13. the measured distribution across a wider sample (back to the top)
js("window.scrollTo({top: 0})")
for _ in range(8):
    cdp("Input.dispatchMouseEvent", type="mouseWheel", x=800, y=500, deltaX=0, deltaY=-420)
    time.sleep(0.3)
time.sleep(1.5)
shot('14-stats', '200 launches decoded: half graduate, half never clear a tenth')

json.dump(beats, open(f'{OUT}/beats.json','w'), indent=1)
print('total beats:', len(beats))
