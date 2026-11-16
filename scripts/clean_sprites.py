import os
import glob
import numpy as np
from PIL import Image, ImageFilter

RAW_DIR = "assets/raw"
OUT_DIR = "public/sprites"
TARGET_SIZE = (80, 80)
PADDING_BOTTOM = 4  # margem inferior em pixels para os pés não encostarem na borda
PADDING_TOP = 6     # margem superior mínima


def remove_green_screen(img: Image.Image) -> Image.Image:
    rgba = img.convert("RGBA")
    data = np.array(rgba, dtype=np.int32)
    r, g, b, a = data[:, :, 0], data[:, :, 1], data[:, :, 2], data[:, :, 3]

    # Remove qualquer tom predominante de verde (inclusive sombras/gradientes no chroma-key)
    is_green = (g > 90) & (g > r + 28) & (g > b + 28)
    data[is_green, 3] = 0

    # Descontaminação de halo verde nas bordas semi-transparentes (despill)
    edge_green = (~is_green) & (g > r) & (g > b)
    data[edge_green, 1] = np.maximum(r[edge_green], b[edge_green])

    cleaned = Image.fromarray(data.astype(np.uint8), "RGBA")

    # Erosão leve de 1px no canal alfa para eliminar contorno verde residual
    alpha = cleaned.split()[3]
    eroded_alpha = alpha.filter(ImageFilter.MinFilter(3))
    # Mantém a nitidez binária (pixel art sem semi-transparência borrada)
    eroded_alpha = eroded_alpha.point(lambda p: 255 if p > 128 else 0)
    cleaned.putalpha(eroded_alpha)
    return cleaned


def remove_small_islands(img: Image.Image, min_pixels: int = 15) -> Image.Image:
    arr = np.array(img)
    alpha = arr[:, :, 3] > 0
    h, w = alpha.shape
    visited = np.zeros_like(alpha, dtype=bool)

    for y in range(h):
        for x in range(w):
            if alpha[y, x] and not visited[y, x]:
                stack = [(y, x)]
                visited[y, x] = True
                component = []
                while stack:
                    cy, cx = stack.pop()
                    component.append((cy, cx))
                    for ny in range(max(0, cy - 1), min(h, cy + 2)):
                        for nx in range(max(0, cx - 1), min(w, cx + 2)):
                            if alpha[ny, nx] and not visited[ny, nx]:
                                visited[ny, nx] = True
                                stack.append((ny, nx))
                if len(component) < min_pixels:
                    for cy, cx in component:
                        arr[cy, cx, 3] = 0

    return Image.fromarray(arr, "RGBA")


def normalize_to_canvas(img: Image.Image, is_vfx: bool = False) -> Image.Image:
    bbox = img.getbbox()
    if not bbox:
        return Image.new("RGBA", TARGET_SIZE, (0, 0, 0, 0))

    cropped = img.crop(bbox)
    cw, ch = cropped.size

    max_w = TARGET_SIZE[0] - 8
    max_h = TARGET_SIZE[1] - (PADDING_TOP + PADDING_BOTTOM)
    scale = min(max_w / cw, max_h / ch)

    new_w = max(1, int(round(cw * scale)))
    new_h = max(1, int(round(ch * scale)))

    # NEAREST preserva os pixels nítidos sem borrar
    resized = cropped.resize((new_w, new_h), Image.Resampling.NEAREST)

    canvas = Image.new("RGBA", TARGET_SIZE, (0, 0, 0, 0))
    paste_x = (TARGET_SIZE[0] - new_w) // 2

    if is_vfx:
        # Efeitos (slash, projéteis) ficam centralizados verticalmente
        paste_y = (TARGET_SIZE[1] - new_h) // 2
    else:
        # Personagens ficam ancorados pela base dos pés (originY = 1.0)
        paste_y = TARGET_SIZE[1] - PADDING_BOTTOM - new_h

    canvas.paste(resized, (paste_x, paste_y), resized)
    return canvas


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    files = sorted(
        glob.glob(os.path.join(RAW_DIR, "*.png"))
        + glob.glob(os.path.join(RAW_DIR, "*.jpg"))
        + glob.glob(os.path.join(RAW_DIR, "*.jpeg"))
    )

    if not files:
        print(f"Nenhuma imagem encontrada em '{RAW_DIR}/'.")
        return

    for filepath in files:
        filename = os.path.splitext(os.path.basename(filepath))[0] + ".png"
        is_vfx = "vfx" in filename.lower() or "slash" in filename.lower()

        img = Image.open(filepath)
        img = remove_green_screen(img)
        img = remove_small_islands(img, min_pixels=15)
        final_img = normalize_to_canvas(img, is_vfx=is_vfx)

        out_path = os.path.join(OUT_DIR, filename)
        final_img.save(out_path, "PNG")
        print(f"[OK] {filename} -> {out_path}")


if __name__ == "__main__":
    main()
