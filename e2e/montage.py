import sys
from PIL import Image
# usage: montage.py out.png cols width img1 img2 ...
out, cols, w = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
imgs = [Image.open(p).convert('RGB') for p in sys.argv[4:]]
h = int(w * imgs[0].height / imgs[0].width)
rows = (len(imgs) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w + (cols - 1) * 6, rows * h + (rows - 1) * 6), (255, 0, 255))
for i, im in enumerate(imgs):
    sheet.paste(im.resize((w, h), Image.LANCZOS), ((i % cols) * (w + 6), (i // cols) * (h + 6)))
sheet.save(out)
