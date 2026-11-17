"""Shrink the report PDF: re-encode every RGB image as a 256-colour indexed image (lossless-looking for screenshots)."""
import sys, zlib
import pikepdf
from pikepdf import Name, PdfImage
from PIL import Image

src, dst = sys.argv[1:3]
pdf = pikepdf.open(src)
seen = set()
for pno, page in enumerate(pdf.pages, 1):
    for name, raw in list(page.images.items()):
        if raw.objgen in seen:
            continue
        seen.add(raw.objgen)
        try:
            img = PdfImage(raw).as_pil_image()
        except Exception:
            continue
        if raw.get('/SMask') is not None:
            continue
        q = img.convert('RGB').quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
        pal = bytes(q.getpalette()[:768]).ljust(768, b'\0')
        raw.write(zlib.compress(q.tobytes(), 9), filter=Name.FlateDecode)
        raw.ColorSpace = pikepdf.Array([Name.Indexed, Name.DeviceRGB, 255, pikepdf.String(pal)])
        raw.BitsPerComponent = 8
        print(pno, name, img.size, flush=True)
        for k in ('/DecodeParms', '/Decode'):
            if k in raw:
                del raw[k]
pdf.save(dst, compress_streams=True, object_stream_mode=pikepdf.ObjectStreamMode.generate)
