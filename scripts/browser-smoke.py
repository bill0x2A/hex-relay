#!/usr/bin/env python3
"""Optional UI verification. Requires Python Playwright and Chromium, not used by the game.

Run from the repository root: python3 scripts/browser-smoke.py
Set CHROMIUM to override the browser executable. Starts its own loopback server.
"""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import time
import urllib.request

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'artifacts'
ARTIFACTS.mkdir(exist_ok=True)
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
origin = f'http://127.0.0.1:{port}'
server = subprocess.Popen(['node', 'server.mjs'], cwd=ROOT,
                          env={**os.environ, 'HOST': '127.0.0.1', 'PORT': str(port)},
                          stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
errors = []
checks = []
capture = """
window.__states = [];
const NativeWebSocket = window.WebSocket;
window.WebSocket = class extends NativeWebSocket {
  constructor(...args) {
    super(...args);
    this.addEventListener('message', e => {
      const m = JSON.parse(e.data);
      if (m.type === 'state') {
        window.__states.push(m.state);
        if (window.__states.length > 300) window.__states.shift();
      }
    });
  }
};
"""
try:
    for attempt in range(50):
        if server.poll() is not None:
            raise RuntimeError(server.stderr.read().decode())
        try:
            with urllib.request.urlopen(origin + '/health', timeout=1):
                break
        except OSError:
            time.sleep(0.1)
    else:
        raise RuntimeError('Server did not start')
    with sync_playwright() as p:
        executable = os.environ.get('CHROMIUM') or shutil.which('chromium') or shutil.which('google-chrome') or shutil.which('google-chrome-stable')
        browser = p.chromium.launch(executable_path=executable, headless=True,
                                    args=['--no-sandbox', '--disable-dev-shm-usage'])
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1, bypass_csp=True)
        context.add_init_script(capture)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(origin)
        expect(page.locator('#entryName')).to_have_text('SOLO')
        expect(page.locator('#fps')).to_contain_text('FPS', timeout=5000)
        page.screenshot(path=str(ARTIFACTS / 'menu.png'))
        page.keyboard.press('ArrowRight')
        expect(page.locator('#entrySub')).to_have_text('HARD')
        page.keyboard.press('ArrowLeft')
        checks.append('Arena menu renders, the animation loop runs, arrows change the entry')
        page.click('#howButton')
        expect(page.locator('#helpDialog')).to_be_visible()
        page.click('#gotIt')
        expect(page.locator('#helpDialog')).not_to_be_visible()
        page.click('#motionButton')
        expect(page.locator('#motionButton')).to_have_attribute('aria-pressed', 'true')
        page.click('#soundButton')
        expect(page.locator('#soundButton')).to_have_attribute('aria-pressed', 'true')
        page.click('#soundButton')
        checks.append('Instructions, reduced motion, and audio controls work')
        page.keyboard.press('Space')
        expect(page.locator('#hud')).to_be_visible()
        page.wait_for_timeout(600)
        page.keyboard.press('p')
        expect(page.locator('#centerMessage')).to_contain_text('PAUSED')
        frozen = page.locator('#timer').inner_text()
        page.wait_for_timeout(250)
        assert page.locator('#timer').inner_text() == frozen
        page.keyboard.press('p')
        page.keyboard.down('ArrowRight')
        page.wait_for_timeout(400)
        page.keyboard.up('ArrowRight')
        page.screenshot(path=str(ARTIFACTS / 'solo.png'))
        expect(page.locator('#results')).to_be_visible(timeout=30000)
        page.keyboard.press('Space')
        expect(page.locator('#results')).not_to_be_visible()
        page.keyboard.press('Escape')
        expect(page.locator('#menu')).to_be_visible()
        checks.append('Solo instant start, movement, pause/resume, death, instant restart, and exit')
        for _ in range(5):
            page.click('#nextEntry')
        expect(page.locator('#entryName')).to_have_text('DUEL')
        page.keyboard.press('Space')
        expect(page.locator('#playerLegend')).to_contain_text('Player 2')
        expect(page.locator('#results')).to_be_visible(timeout=30000)
        expect(page.locator('#resultTitle')).to_contain_text('DRAW')
        page.click('#retryButton')
        expect(page.locator('#results')).not_to_be_visible()
        page.keyboard.press('Escape')
        checks.append('Local duel same-tick draw and rematch')
        page.click('#prevEntry')
        expect(page.locator('#entrySub')).to_have_text('LOCAL 1V1')
        page.keyboard.press('Space')
        expect(page.locator('#hud')).to_be_visible()
        page.wait_for_timeout(2500)
        page.keyboard.press('KeyW')
        page.screenshot(path=str(ARTIFACTS / 'local-battle.png'))
        expect(page.locator('#results')).to_be_visible(timeout=40000)
        page.keyboard.press('Escape')
        checks.append('Local split-screen battle runs to a result')
        page.click('#prevEntry')
        expect(page.locator('#entrySub')).to_have_text('VS CPU')
        page.keyboard.press('Space')
        page.wait_for_timeout(3000)
        page.screenshot(path=str(ARTIFACTS / 'cpu-battle.png'))
        page.keyboard.press('Escape')
        checks.append('Battle against the CPU starts')
        for _ in range(3):
            page.click('#nextEntry')
        expect(page.locator('#entryName')).to_have_text('ONLINE')
        page.keyboard.press('Space')
        expect(page.locator('#onlinePanel')).to_be_visible()
        page.fill('#playerName', 'Alpha')
        page.click('#createButton')
        expect(page.locator('#roomPanel')).to_be_visible()
        code = page.locator('#displayCode').inner_text()
        second_context = browser.new_context(viewport={'width': 1280, 'height': 900}, bypass_csp=True)
        second_context.add_init_script(capture)
        rival = second_context.new_page()
        rival.on('pageerror', lambda error: errors.append(str(error)))
        rival.goto(origin + '/?room=' + code)
        expect(rival.locator('#roomCode')).to_have_value(code)
        rival.fill('#playerName', 'Beta')
        rival.click('#joinButton')
        expect(rival.locator('#roomPanel')).to_be_visible()
        expect(page.locator('#roster li')).to_have_count(2)
        expect(rival.locator('#startButton')).to_be_disabled()
        page.click('#modeBattle')
        expect(rival.locator('#modeBattle')).to_have_attribute('aria-pressed', 'true')
        page.screenshot(path=str(ARTIFACTS / 'lobby.png'))
        page.click('#startButton')
        expect(page.locator('#hud')).to_be_visible()
        expect(rival.locator('#hud')).to_be_visible()
        page.wait_for_function("window.__states.at(-1)?.phase === 'playing'", timeout=6000)
        assert page.evaluate('window.__states.at(-1).mode') == 'battle'
        initial = page.evaluate('window.__states.at(-1).players[0].angle')
        page.keyboard.down('KeyD')
        page.wait_for_timeout(250)
        page.keyboard.up('KeyD')
        moved = page.evaluate('window.__states.at(-1).players[0].angle')
        assert abs(moved - initial) > 0.2, (initial, moved)
        page.screenshot(path=str(ARTIFACTS / 'online.png'))
        # Closing a rival must finish the round and award the connected survivor.
        rival.close()
        expect(page.locator('#results')).to_be_visible(timeout=5000)
        expect(page.locator('#resultTitle')).to_contain_text('ALPHA WINS')
        page.click('#backButton')
        expect(page.locator('#roomPanel')).to_be_visible()
        expect(page.locator('#roster .wins')).to_have_text('1W')
        page.click('#leaveButton')
        checks.append('Two browser clients create/join a battle room, authoritative movement, disconnect win, lobby return')
        mobile = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        phone = mobile.new_page()
        phone.on('pageerror', lambda error: errors.append(str(error)))
        phone.goto(origin)
        phone.screenshot(path=str(ARTIFACTS / 'mobile.png'), full_page=True)
        assert phone.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile horizontal overflow'
        phone.click('#playButton')
        expect(phone.locator('#touchControls')).to_be_visible()
        phone.screenshot(path=str(ARTIFACTS / 'mobile-game.png'))
        checks.append('390px mobile layout and touch controls')
        metrics = page.locator('#fps').inner_text()
        browser.close()
        assert not errors, errors
        report = {'checks': checks, 'page_errors': errors, 'observed_fps': metrics,
                  'note': 'Headless Linux Chromium only; FPS is not a desktop hardware benchmark.'}
        (ARTIFACTS / 'browser-report.json').write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(report, indent=2))
finally:
    server.terminate()
    try:
        server.wait(timeout=5)
    except subprocess.TimeoutExpired:
        server.kill()
