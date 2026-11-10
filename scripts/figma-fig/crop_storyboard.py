#!/usr/bin/env python3
"""Cut each F&F app screen out of the Figma render of its "Storyboard step" (figma/screens/h8rm8.../2-<step>_*.png).

The step renders were exported by Figma at 1x with their render bounds, which include the drop shadows.
The render origin is recomputed from the REST tree (union of every node box grown by its shadows), checked against
the PNG size, and the screen frame (the step's second child) is cropped at its own box. Output:
figma/screens/<key>/<screenId>_screen.png, the reference the verify harness compares the build with.
    python3 scripts/figma-fig/crop_storyboard.py
"""
import json, os, sys
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
KEY = 'h8rm8AicgWcMQ2FpMe0bDK'
rest = json.load(open(f'{ROOT}/figma/rest/{KEY}.json'))
shots = f'{ROOT}/figma/screens/{KEY}'


def render_bounds(n):
    b = n['absoluteBoundingBox']
    x0, y0, x1, y1 = b['x'], b['y'], b['x'] + b['width'], b['y'] + b['height']
    for e in n.get('effects', []):
        if e.get('visible', True) and e['type'] == 'DROP_SHADOW':
            g = e['radius'] + e.get('spread', 0)
            x0 = min(x0, b['x'] + e['offset']['x'] - g); y0 = min(y0, b['y'] + e['offset']['y'] - g)
            x1 = max(x1, b['x'] + b['width'] + e['offset']['x'] + g); y1 = max(y1, b['y'] + b['height'] + e['offset']['y'] + g)
    for c in n.get('children', []):
        if c.get('visible', True):
            cx0, cy0, cx1, cy1 = render_bounds(c)
            if not n.get('clipsContent'):
                x0, y0, x1, y1 = min(x0, cx0), min(y0, cy0), max(x1, cx1), max(y1, cy1)
    return x0, y0, x1, y1


steps = []
def walk(n):
    if n.get('name') == 'Storyboard step':
        steps.append(n); return
    for c in n.get('children', []): walk(c)
walk(rest['document'])

bad = 0
for st in steps:
    png = [f for f in os.listdir(shots) if f.startswith(st['id'].replace(':', '-') + '_')]
    if not png: print('no render for', st['id']); bad += 1; continue
    im = Image.open(f'{shots}/{png[0]}')
    x0, y0, x1, y1 = render_bounds(st)
    if (round(x1 - x0), round(y1 - y0)) != im.size:
        print(f"{st['id']}: computed render {round(x1 - x0)}x{round(y1 - y0)} != png {im.size}"); bad += 1; continue
    scr = st['children'][1]; b = scr['absoluteBoundingBox']
    box = (round(b['x'] - x0), round(b['y'] - y0), round(b['x'] - x0 + b['width']), round(b['y'] - y0 + b['height']))
    im.crop(box).save(f"{shots}/{scr['id'].replace(':', '-')}_screen.png")
print(f'{len(steps) - bad}/{len(steps)} screens cropped')
sys.exit(1 if bad else 0)
