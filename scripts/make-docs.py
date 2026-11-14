"""Redraws every picture in docs/ and the sample guide in examples/ from what
the end-to-end test captured. Run from the repository root:

    DOCS=1 node test/e2e.js && python3 scripts/make-docs.py

Needs Pillow (pip install Pillow). All pictures come from the made-up demo
site in test/site/, never from a real page."""
import os, shutil, glob
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'test', 'out')
DOCS = os.path.join(ROOT, 'docs')
EXAMPLES = os.path.join(ROOT, 'examples')

# test/out name -> docs name
COPY = {
    'panel-steps-1280.png': 'panel.png',
    'sent-1280.png': 'guide-page.png',
    'clip-b.png': 'clip.png',
    'export-1280.png': 'web-page.png',
    'library-1280.png': 'my-guides.png',
    'options-1280.png': 'settings.png',
    'popup.png': 'popup.png',
    'guide-390.png': 'phone-guide.png',
    'export-390.png': 'phone-web-page.png',
    'library-390.png': 'phone-my-guides.png',
}
for a, b in COPY.items():
    shutil.copyfile(os.path.join(OUT, a), os.path.join(DOCS, b))

# a finished guide anyone can open without installing anything
shutil.copyfile(os.path.join(OUT, 'export.html'), os.path.join(EXAMPLES, 'sample-guide.html'))
shutil.copyfile(os.path.join(OUT, 'guide.json'), os.path.join(EXAMPLES, 'sample-guide.json'))

W, H, BAR = 1200, 800, 72
ACC = (79, 70, 229); INK = (15, 23, 42); BG = (246, 246, 250)
def font(weight, size):
    # Inter when it is installed, otherwise Pillow's own font so the script still runs
    try:
        return ImageFont.truetype(f'/usr/share/fonts/opentype/inter/Inter-{weight}.otf', size)
    except OSError:
        return ImageFont.load_default(size)

bold = font('SemiBold', 30)
small = font('Medium', 22)

def shot(name, crop=None):
    im = Image.open(f'{OUT}/{name}').convert('RGB')
    if crop: im = im.crop(crop)
    return im

def frame(n, caption, im):
    c = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(c)
    d.rectangle([0, 0, W, BAR], fill=INK)
    d.ellipse([24, 20, 56, 52], fill=ACC)
    d.text((40, 36), str(n), font=small, fill='white', anchor='mm')
    d.text((72, 36), caption, font=bold, fill='white', anchor='lm')
    area = (W - 40, H - BAR - 30)
    im = im.copy(); im.thumbnail(area, Image.LANCZOS)
    x = (W - im.width) // 2; y = BAR + 15 + (area[1] - im.height) // 2
    d.rounded_rectangle([x - 2, y - 2, x + im.width + 1, y + im.height + 1], radius=10, outline=(220, 222, 230), width=2)
    c.paste(im, (x, y))
    return c

page = shot('panel-1280.png')
pop = shot('popup.png')
start = page.copy()
ImageDraw.Draw(start).rectangle([930, 0, page.width, 520], fill='white')   # no panel before the guide starts
sh = Image.new('RGB', (pop.width + 2, pop.height + 2), (210, 212, 222)); start.paste(sh, (page.width - pop.width - 41, 9)); start.paste(pop, (page.width - pop.width - 40, 10))  # the popup over the page, as Chrome shows it
frames = [
    (frame(1, 'Press the icon and start a guide', start), 2200),
    (frame(2, 'Click through the task: each click is a step', shot('panel-steps-1280.png')), 2600),
    (frame(3, 'A step that moves gets a short clip', shot('clip-a.png')), 900),
    (frame(3, 'A step that moves gets a short clip', shot('clip-b.png')), 1800),
    (frame(4, 'Finish: edit the words, download or send it', shot('sent-1280.png')), 2800),
    (frame(5, 'Share one web page that opens anywhere', shot('export-1280.png')), 2600),
]
ims = [f.resize((960, 640), Image.LANCZOS).quantize(colors=128, method=Image.Quantize.MEDIANCUT) for f, _ in frames]
ims[0].save(f'{DOCS}/demo.gif', save_all=True, append_images=ims[1:], duration=[d for _, d in frames], loop=0, optimize=True)

# 1280x640 social preview: what the repo is, beside the finished guide
sp = Image.new('RGB', (1280, 640), BG)
d = ImageDraw.Draw(sp)
icon = Image.open(f'{DOCS}/../icons/icon-128.png').convert('RGBA')
sp.paste(icon, (80, 110), icon)
d.text((80, 280), 'Step Guide Recorder', font=font('Bold', 50), fill=INK)
for i, line in enumerate(['Click through a task once.', 'Get a step-by-step guide with', 'a picture of every step.']):
    d.text((80, 370 + i * 42), line, font=font('Medium', 30), fill=(91, 100, 116))
d.text((80, 530), 'Free and open source  ·  No account  ·  Stays in your browser', font=small, fill=ACC)
g = shot('sent-1280.png', (190, 70, 1090, 800)); g.thumbnail((500, 520), Image.LANCZOS)
sp.paste(g, (720, 60))
d.rounded_rectangle([718, 58, 720 + g.width, 60 + g.height], radius=8, outline=(220, 222, 230), width=2)
sp.save(f'{DOCS}/social-preview.png')

# the drag step playing, as it does on the guide page
frames = sorted(glob.glob(os.path.join(OUT, 'clip-frames', '*.png')))
if frames:
    ims = [Image.open(f).convert('RGB') for f in frames]
    w = 720; ims = [im.resize((w, round(im.height * w / im.width)), Image.LANCZOS).quantize(colors=128, method=Image.Quantize.MEDIANCUT) for im in ims]
    ims[0].save(os.path.join(DOCS, 'clip.gif'), save_all=True, append_images=ims[1:], duration=250, loop=0, optimize=True)
else:
    print('no clip frames: run the test with DOCS=1 to redraw docs/clip.gif')
print('docs/ and examples/ redrawn')
