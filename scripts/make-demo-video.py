#!/usr/bin/env python3
"""Assemble the CurveCraft demo video from captured frames + macOS TTS narration.

    npx tsx scripts/emit-launch.ts            # (unrelated; emit a launch script)
    python3 scripts/make-demo-video.py

Prerequisites: macOS `say` and ffmpeg. Frames come from
`scripts/capture-demo-frames.py`, which drives the deployed app with browser-harness
and screenshots each beat. Requires Pillow (captions are rendered with PIL because
this ffmpeg build has no drawtext filter).
"""
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

FRAMES = os.environ.get('FRAMES', 'browser-tmp/frames')
# Two cuts share one set of captured frames: the full walkthrough, and a short
# pitch that leads with the measurement. `CUT=pitch` selects the subset.
CUT = os.environ.get('CUT', 'demo')
BUILD = os.environ.get('BUILD', f'browser-tmp/video-{CUT}')
OUT = os.environ.get('OUT', 'docs/pitch.mp4' if CUT == 'pitch' else 'docs/demo.mp4')
VOICE = os.environ.get('VOICE', 'Samantha')
RATE = os.environ.get('RATE', '178')
FONT = '/System/Library/Fonts/Supplemental/Arial.ttf'
W, H, FPS = 1920, 1080, 30

BEATS = [
    ('00-title', None, 'CurveCraft', 'Design, simulate and ship token launches on Meteora DBC',
     "This is CurveCraft. It takes a token launch and compiles it into a real Meteora Dynamic Bonding Curve config — using the official SDK, not a spreadsheet."),
    ('01-studio', '01-studio', 'Compiled into a real Meteora DBC config', None,
     "Every number on this screen is priced by Meteora's own swap math. Start market cap, graduation market cap, fee schedule, curve shape, migration split."),
    ('02-double', '02-double', 'Doubling the graduation target costs 1.5x the raise', None,
     "Here is the first thing that surprised us. Doubling the graduation market cap does not double the raise. It costs about one and a half times: twenty-four hundred SOL, not thirty-two hundred."),
    ('03-flat', '03-flat', 'A flat curve needs 27% less capital for the same valuation', None,
     "Curve shape matters just as much. Same market caps, but a flat curve — sixteen weighted segments with deep early liquidity — reaches the same valuation with twenty-seven percent less capital."),
    ('04-fees', '04-fees', 'Meme Speedrun: 20% decaying to 1% in thirty minutes', None,
     "Now the fee schedule. Meme Speedrun starts at twenty percent and decays exponentially to one percent in thirty minutes."),
    ('05-sniper', '05-sniper', 'Sniper wave: sixty bots in the first ten seconds', None,
     "CurveCraft replays realistic demand against the design. This is a sniper wave: sixty bots inside the first ten seconds, followed by ordinary buyers."),
    ('06-whale', '06-whale', 'A whale takes a position, then dumps into the curve', None,
     "And this is a whale that takes a position, then dumps into the curve."),
    ('07-scoreboard', '07-scoreboard', 'The sniper premium: what each demand pattern really pays', None,
     "The scoreboard reports the effective fee rate for each pattern. Organic demand pays two point four eight percent. The sniper wave pays three point zero two — a twenty-two percent premium. With a slow two hour decay, the same bots paid about one percent more. A long decay is a fee increase with extra steps."),
    ('08-montecarlo', '08-montecarlo', 'Two hundred sampled demand paths, priced fill by fill', None,
     "Three scenarios still are not a plan, so CurveCraft samples two hundred demand paths — buyer counts, buy sizes, sniper waves, whales — and prices every one of them fill by fill. The result is a graduation probability, and the full spread of outcomes, not just a median."),
    ('09-compare', '09-compare', 'Head to head: the same demand against every design', None,
     "You can also put designs head to head: the same demand replayed against every config you select, with raise target, fee rate, sniper premium and graduation time side by side."),
    ('10-lint', '10-lint', "Checked against the program's own rules before export", None,
     "Before anything is exported, every design is checked against the program's own rules. That check caught a real bug: our own presets used a hundred percent liquid split, which throws inside create-config at deploy time."),
    ('11-script', '11-script', 'Export a runnable launch script, verified on mainnet', None,
     "The export is a runnable launch script. We simulated that exact transaction against mainnet: the program logs CreateConfig, and returns no error."),
    ('12-presets', '12-presets', 'Nine presets across asset classes, including an ICM pair', None,
     "There is a preset marketplace with measured graduation odds, so you fork a starting point instead of a blank page. Nine designs now, across community tokens, memes, stablecoins, tokenized equity, RWA, agent tokens, and an ICM pair quoted in another community token."),
    ('13-pools', '13-pools', 'Live mainnet DBC pools, read from the program', None,
     "And a live view of the pools actually launching on mainnet right now, showing each raise against its graduation threshold."),
    ('14-stats', '14-stats', 'Half graduate, half never clear a tenth of their raise', None,
     "The presets are calibrated against measurement, not taste. We decoded two hundred live launches from their own configs, in account-address order so the sample is not skewed toward whoever traded last. Fifty-two percent graduated. Forty-eight percent never cleared a tenth of their raise. Nothing sat in between, because a curve nobody is buying does not drift sideways — it stops. And fifty-one percent of those configs hold less liquidity at day one than the program requires, which is why the launch check runs the program's own validator instead of trusting precedent."),
    ('15-end', None, 'CurveCraft', 'Live demo: ak-blank.github.io/curvecraft  ·  github.com/AK-blank/curvecraft',
     "CurveCraft. Design, simulate and ship token launches on Meteora's Dynamic Bonding Curve. The live demo and the source are in the description."),
]

# The pitch cut: what it does, why the numbers are measured, and the finding.
PITCH_BEATS = {'00-title', '01-studio', '08-montecarlo', '10-lint', '12-presets', '14-stats', '15-end'}
if CUT == 'pitch':
    BEATS = [beat for beat in BEATS if beat[0] in PITCH_BEATS]


def run(cmd):
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print('CMD FAILED:', ' '.join(cmd))
        print(result.stderr[-1500:])
        sys.exit(1)
    return result.stdout


def duration(path):
    return float(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]).strip())


def esc(text):
    return text


def wrap(draw, text, font, max_width):
    words = text.split()
    lines, current = [], ''
    for word in words:
        candidate = f'{current} {word}'.strip()
        if draw.textlength(candidate, font=font) <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def card(title, subtitle, path):
    """Title / end card rendered with PIL (this ffmpeg has no drawtext)."""
    img = Image.new('RGB', (W, H), (2, 6, 23))
    draw = ImageDraw.Draw(img)
    title_font = ImageFont.truetype(FONT, 86)
    sub_font = ImageFont.truetype(FONT, 34)
    draw.text(((W - draw.textlength(title, font=title_font)) / 2, H / 2 - 130), title,
              font=title_font, fill=(167, 139, 250))
    lines = wrap(draw, subtitle, sub_font, W - 320)
    y = H / 2 + 20
    for line in lines:
        draw.text(((W - draw.textlength(line, font=sub_font)) / 2, y), line,
                  font=sub_font, fill=(226, 232, 240))
        y += 46
    img.save(path)


def captioned(frame_path, caption, path):
    """Frame with a translucent caption bar burned in."""
    img = Image.open(frame_path).convert('RGB')
    scale = W / img.width
    img = img.resize((W, int(img.height * scale)), Image.LANCZOS)
    if img.height > H:
        top = (img.height - H) // 2
        img = img.crop((0, top, W, top + H))
    else:
        canvas = Image.new('RGB', (W, H), (2, 6, 23))
        canvas.paste(img, (0, (H - img.height) // 2))
        img = canvas

    bar_h = 104
    overlay = Image.new('RGBA', (W, bar_h), (2, 6, 23, 205))
    img = img.convert('RGBA')
    img.alpha_composite(overlay, (0, H - bar_h))
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT, 30)
    lines = wrap(draw, caption, font, W - 96)
    y = H - bar_h + 22
    for line in lines[:2]:
        draw.text((48, y), line, font=font, fill=(241, 245, 249))
        y += 38
    img.convert('RGB').save(path)


os.makedirs(BUILD, exist_ok=True)
segments = []

for index, (name, frame, title, subtitle, narration) in enumerate(BEATS):
    audio = f'{BUILD}/{name}.aiff'
    run(['say', '-v', VOICE, '-r', RATE, '-o', audio, narration])
    spoken = duration(audio)
    hold = max(6.0, spoken + 1.6)

    padded = f'{BUILD}/{name}.wav'
    run(['ffmpeg', '-y', '-v', 'error', '-i', audio, '-af', f'apad=whole_dur={hold:.3f}',
         '-ar', '44100', '-ac', '1', padded])

    seg = f'{BUILD}/{name}.mp4'
    still = f'{BUILD}/{name}.png'
    if frame:
        captioned(f'{FRAMES}/{frame}.png', title or subtitle or '', still)
    else:
        card(title, subtitle, still)
    run(['ffmpeg', '-y', '-v', 'error', '-loop', '1', '-i', still, '-t', f'{hold:.3f}',
         '-vf', 'format=yuv420p', '-r', str(FPS), '-c:v', 'libx264', '-preset', 'medium',
         '-crf', '20', seg])

    segments.append({'name': name, 'video': seg, 'audio': padded, 'hold': hold, 'spoken': spoken})
    print(f'{name:<15} narration {spoken:5.1f}s  hold {hold:5.1f}s')

with open(f'{BUILD}/video_list.txt', 'w') as fh:
    for s in segments:
        fh.write(f"file '{os.path.abspath(s['video'])}'\n")
with open(f'{BUILD}/audio_list.txt', 'w') as fh:
    for s in segments:
        fh.write(f"file '{os.path.abspath(s['audio'])}'\n")

run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', f'{BUILD}/video_list.txt',
     '-c', 'copy', f'{BUILD}/silent.mp4'])
run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', f'{BUILD}/audio_list.txt',
     '-c', 'copy', f'{BUILD}/narration.wav'])

os.makedirs(os.path.dirname(OUT), exist_ok=True)
run(['ffmpeg', '-y', '-v', 'error', '-i', f'{BUILD}/silent.mp4', '-i', f'{BUILD}/narration.wav',
     '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', OUT])

total = sum(s['hold'] for s in segments)
print(f'\nwrote {OUT} — {total:.0f}s ({total/60:.1f} min), {os.path.getsize(OUT)/1e6:.1f} MB')
json.dump(segments, open(f'{BUILD}/segments.json', 'w'), indent=1)
