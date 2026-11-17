from __future__ import annotations
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

    cleaned = Image.fromarray(data.astype(np.uint8))

    # Erosão leve de 1px no canal alfa para eliminar contorno verde residual
    alpha = cleaned.split()[3]
    eroded_alpha = alpha.filter(ImageFilter.MinFilter(3))
    # Mantém a nitidez binária (pixel art sem semi-transparência borrada)
    eroded_alpha = eroded_alpha.point(lambda p: 255 if p > 128 else 0)
    cleaned.putalpha(eroded_alpha)
    return cleaned


def remove_small_islands(img: Image.Image, min_pixels: int = 15) -> Image.Image:
    """
    Remove ruído e ilhas isoladas de pixels usando abertura morfológica ultrarrápida.
    """
    alpha = img.split()[3]
    # Abertura morfológica (erosão seguida de dilatação) elimina ilhas minúsculas instantaneamente
    cleaned_alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    cleaned_alpha = cleaned_alpha.point(lambda p: 255 if p > 128 else 0)

    res = img.copy()
    res.putalpha(cleaned_alpha)
    return res


def normalize_to_canvas(
    img: Image.Image,
    is_vfx: bool = False,
    forced_scale: float | None = None,
    anchor_center_x: float | None = None
) -> Image.Image:
    bbox = img.getbbox()
    if not bbox:
        return Image.new("RGBA", TARGET_SIZE, (0, 0, 0, 0))

    cropped = img.crop(bbox)
    cw, ch = cropped.size

    max_w = TARGET_SIZE[0] - 8
    max_h = TARGET_SIZE[1] - (PADDING_TOP + PADDING_BOTTOM)

    if forced_scale is not None:
        scale = forced_scale
    else:
        scale = min(max_w / cw, max_h / ch)

    new_w = max(1, int(round(cw * scale)))
    new_h = max(1, int(round(ch * scale)))

    # NEAREST preserva os pixels nítidos sem borrar
    resized = cropped.resize((new_w, new_h), Image.Resampling.NEAREST)

    canvas = Image.new("RGBA", TARGET_SIZE, (0, 0, 0, 0))

    if anchor_center_x is not None:
        scaled_anchor = anchor_center_x * scale
        paste_x = int(round(TARGET_SIZE[0] / 2 - scaled_anchor))
        paste_x = max(0, min(TARGET_SIZE[0] - new_w, paste_x))
    else:
        paste_x = (TARGET_SIZE[0] - new_w) // 2

    if is_vfx:
        # Efeitos (slash, projéteis) ficam centralizados verticalmente
        paste_y = (TARGET_SIZE[1] - new_h) // 2
    else:
        # Personagens ficam ancorados pela base dos pés (originY = 1.0)
        paste_y = TARGET_SIZE[1] - PADDING_BOTTOM - new_h

    canvas.paste(resized, (paste_x, paste_y), resized)
    return canvas


def detect_character_blocks(img: Image.Image) -> list[tuple[int, int]]:
    """
    Detecta se a imagem é uma folha com múltiplos personagens separados no eixo X.
    Retorna lista de intervalos (start_x, end_x).
    """
    rgb = img.convert("RGB")
    arr = np.array(rgb)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    is_green = (g > 90) & (g > r + 28) & (g > b + 28)
    col_counts = np.sum(~is_green, axis=0)

    in_block = False
    blocks = []
    start = 0
    # Threshold de pixels por coluna para desconsiderar ruído residual
    threshold = int(arr.shape[0] * 0.05)
    for x in range(len(col_counts)):
        if col_counts[x] > threshold and not in_block:
            in_block = True
            start = x
        elif col_counts[x] <= threshold and in_block:
            in_block = False
            # Bloco de personagem real precisa ter largura representativa (> 10% da altura)
            if (x - start) > arr.shape[0] * 0.15:
                blocks.append((start, x))
    if in_block and (len(col_counts) - start) > arr.shape[0] * 0.15:
        blocks.append((start, len(col_counts)))

    if len(blocks) > 1:
        max_w = max(ex - sx for sx, ex in blocks)
        # Frames reais de uma mesma folha têm larguras comparáveis (>= 50% da maior largura)
        blocks = [b for b in blocks if (b[1] - b[0]) >= 0.5 * max_w]

    return blocks


def process_image(filepath: str):
    filename = os.path.splitext(os.path.basename(filepath))[0]
    is_vfx = "vfx" in filename.lower() or "slash" in filename.lower()

    raw_img = Image.open(filepath)
    blocks = detect_character_blocks(raw_img)

    if len(blocks) > 1 and not is_vfx:
        print(f"[*] {filename}: detectados {len(blocks)} frames em folha. Fatiando...")
        cropped_cleaned_frames = []
        max_cw = 0
        max_ch = 0

        for sx, ex in blocks:
            # Margem de segurança de 20px ao redor do bloco
            pad = 20
            crop_box = (max(0, sx - pad), 0, min(raw_img.width, ex + pad), raw_img.height)
            crop = raw_img.crop(crop_box)
            cleaned = remove_green_screen(crop)
            cleaned = remove_small_islands(cleaned, min_pixels=15)

            bbox = cleaned.getbbox()
            if bbox:
                c_crop = cleaned.crop(bbox)
                cw, ch = c_crop.size
                max_cw = max(max_cw, cw)
                max_ch = max(max_ch, ch)

                # Calcula centro horizontal dos pés para evitar deslizamento em animações
                alpha_arr = np.array(c_crop)[:, :, 3] > 0
                y_idx, x_idx = np.where(alpha_arr)
                if len(y_idx) > 0:
                    ymax = y_idx.max()
                    feet_mask = alpha_arr[max(0, ymax - 20):ymax + 1, :]
                    fy, fx = np.where(feet_mask)
                    feet_cx = float((fx.min() + fx.max()) / 2.0) if len(fx) > 0 else float(cw / 2.0)
                else:
                    feet_cx = float(cw / 2.0)

                cropped_cleaned_frames.append((cleaned, c_crop, feet_cx))

        if not cropped_cleaned_frames:
            return

        # Escala única global para todos os frames da mesma animação
        max_target_w = TARGET_SIZE[0] - 8
        max_target_h = TARGET_SIZE[1] - (PADDING_TOP + PADDING_BOTTOM)
        global_scale = min(max_target_w / max_cw, max_target_h / max_ch)

        for i, (full_cleaned, c_crop, feet_cx) in enumerate(cropped_cleaned_frames):
            frame_img = normalize_to_canvas(
                full_cleaned,
                is_vfx=False,
                forced_scale=global_scale,
                anchor_center_x=feet_cx
            )
            frame_path = os.path.join(OUT_DIR, f"{filename}_{i}.png")
            frame_img.save(frame_path, "PNG")
            print(f"  [OK] {filename}_{i}.png -> {frame_path}")

            # O primeiro frame também é salvo como imagem padrão sem sufixo
            if i == 0:
                base_path = os.path.join(OUT_DIR, f"{filename}.png")
                frame_img.save(base_path, "PNG")
                print(f"  [OK] {filename}.png (frame 0) -> {base_path}")
    else:
        # Imagem de frame único
        img = remove_green_screen(raw_img)
        img = remove_small_islands(img, min_pixels=15)
        final_img = normalize_to_canvas(img, is_vfx=is_vfx)

        out_path = os.path.join(OUT_DIR, f"{filename}.png")
        final_img.save(out_path, "PNG")
        print(f"[OK] {filename}.png -> {out_path}")


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
        process_image(filepath)


if __name__ == "__main__":
    main()
