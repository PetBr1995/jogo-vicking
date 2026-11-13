#!/usr/bin/env python3
"""
Process raw sprite images:
1. Proporção e escala travadas: Redimensionamento uniforme proporcional (NEAREST)
   sem recorte prévio, mantendo a estatura idêntica em qualquer pose.
2. Preservação de contorno e contraste: NÃO apaga pretos/sombras internas do personagem.
   Se a imagem já tem transparência, preserva 100% dos traços, olhos e armadura.
   Se for chroma key verde ou vinheta, remove apenas a cor do fundo e aplica erosão
   de 1px na máscara alfa da borda externa para eliminar halos.
3. Pré-processamento aprimorado de cores: Realce de contraste e saturação para
   deixar o personagem vivo e nítido (não apagado/lavado), e quantização de 24 cores
   calculada sobre os pixels visíveis do boneco.
"""

import argparse
import json
import os
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

VALID_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.bmp'}

def remove_disconnected_top_islands(frame_img: Image.Image, is_airborne: bool = False) -> Image.Image:
    """
    Remove fragmentos flutuantes/ilhas de pixels no topo do quadro que são
    vazamentos de linhas superiores (como botas do pulo caindo sobre quadros de ataque).
    Detecta se há pequenos fragmentos no topo separados por uma lacuna do corpo principal abaixo.
    Nunca apaga quadros aéreos legítimos (como o pulo).
    """
    if is_airborne:
        return frame_img

    arr = np.array(frame_img)
    alpha = arr[:, :, 3]
    h, w = alpha.shape
    row_counts = np.sum(alpha > 0, axis=1)

    # Identifica pixels nas primeiras linhas (topo do quadro)
    top_limit = int(h * 0.25)
    has_top_pixels = any(row_counts[y] > 0 for y in range(top_limit))
    if not has_top_pixels:
        return frame_img

    # Procura se há uma lacuna vazia logo após os fragmentos do topo
    top_end = max((y for y in range(top_limit) if row_counts[y] > 0), default=-1)
    if top_end == -1:
        return frame_img

    gap = 0
    y = top_end + 1
    while y < h and row_counts[y] == 0:
        gap += 1
        y += 1

    # Só remove os fragmentos do topo se houver gap de pelo menos 8px e o corpo principal abaixo
    if gap >= 8 and y < h:
        pixels_below = np.sum(row_counts[y:])
        pixels_top = np.sum(row_counts[:top_end + 1])
        if pixels_below > pixels_top * 2:
            arr[:top_end + 1, :, 3] = 0

    return Image.fromarray(arr, mode="RGBA")

def remove_disconnected_left_islands(frame_img: Image.Image) -> Image.Image:
    """
    Remove fragmentos de corte à esquerda (como pontas de arcos de ataque vazados da coluna anterior).
    Detecta se há pequenos fragmentos nas primeiras colunas (< 25% da largura) separados por uma
    lacuna vazia (>= 6px) do corpo principal à direita.
    """
    arr = np.array(frame_img)
    alpha = arr[:, :, 3]
    h, w = alpha.shape
    col_counts = np.sum(alpha > 0, axis=0)

    left_limit = int(w * 0.25)
    has_left_pixels = any(col_counts[x] > 0 for x in range(left_limit))
    if not has_left_pixels:
        return frame_img

    left_end = max((x for x in range(left_limit) if col_counts[x] > 0), default=-1)
    if left_end == -1:
        return frame_img

    gap = 0
    x = left_end + 1
    while x < w and col_counts[x] == 0:
        gap += 1
        x += 1

    if gap >= 6 and x < w:
        pixels_right = np.sum(col_counts[x:])
        pixels_left = np.sum(col_counts[:left_end + 1])
        if pixels_right > pixels_left * 2:
            arr[:, :left_end + 1, 3] = 0

    return Image.fromarray(arr, mode="RGBA")

def remove_background_cleanly(
    image: Image.Image,
    tolerance: float = 38.0,
    erode_pixels: int = 1
) -> Image.Image:
    """
    Remove solid / chroma-key background sem apagar pretos e detalhes internos do boneco.
    Se a imagem já tiver fundo transparente, preserva intacta.
    """
    rgba = image.convert("RGBA")
    arr = np.array(rgba)

    # 1. Se a imagem já possui transparência nas bordas, não faz remoção destrutiva
    corner_alphas = [arr[0, 0, 3], arr[0, -1, 3], arr[-1, 0, 3], arr[-1, -1, 3]]
    if any(a == 0 for a in corner_alphas):
        return rgba

    # 2. Se for imagem sólida, detecta chroma key verde ou vinheta azulada
    rgb = arr[:, :, :3].astype(np.float32)
    bg_corner = rgb[0, 0]

    mask = np.zeros(rgb.shape[:2], dtype=bool)

    # Chroma key verde
    is_green = (rgb[:, :, 1] > rgb[:, :, 0] * 1.15) & \
               (rgb[:, :, 1] > rgb[:, :, 2] * 1.15) & \
               (rgb[:, :, 1] > 60)
    mask = mask | is_green

    # Vinheta / fundo nórdico de sheet-base.png
    is_blue_vignette = (rgb[:, :, 2] > rgb[:, :, 0] + 5) & \
                       (rgb[:, :, 2] > rgb[:, :, 1] + 5) & \
                       (rgb[:, :, 2] < 145) & \
                       (rgb[:, :, 0] < 98)
    mask = mask | is_blue_vignette

    # Fundo por distância de cor (apenas se a cor de fundo não for preta/escura)
    if np.mean(bg_corner) > 30 and not np.any(mask):
        diff = rgb - bg_corner
        dist = np.sqrt(np.sum(diff ** 2, axis=-1))
        mask = dist <= tolerance

    # Cria canal alfa
    alpha = np.where(mask, 0, 255).astype(np.uint8)
    alpha_img = Image.fromarray(alpha, mode="L")

    # Erosão na máscara para eliminar halos coloridos do chroma
    if erode_pixels > 0:
        filter_size = erode_pixels * 2 + 1
        alpha_img = alpha_img.filter(ImageFilter.MinFilter(filter_size))

    result = rgba.copy()
    result.putalpha(alpha_img)
    return result

def enhance_vibrancy_and_contrast(image: Image.Image) -> Image.Image:
    """
    Realça contraste e saturação para garantir que o pixel art fique vivo,
    com contornos pretos firmes e cores vibrantes na barba e armadura.
    """
    if image.mode != "RGBA":
        image = image.convert("RGBA")

    alpha = image.getchannel("A")
    rgb = image.convert("RGB")

    # Aumento suave de saturação e contraste
    enh_col = ImageEnhance.Color(rgb).enhance(1.22)
    enh_con = ImageEnhance.Contrast(enh_col).enhance(1.18)

    enhanced = enh_con.convert("RGBA")
    enhanced.putalpha(alpha)
    return enhanced

def quantize_smart_24_colors(image: Image.Image, num_colors: int = 24) -> Image.Image:
    """
    Quantiza a imagem dedicando a paleta de 24 cores aos pixels VISÍVEIS do boneco,
    em vez de gastar slots da paleta com o fundo preto transparente.
    """
    if image.mode != "RGBA":
        image = image.convert("RGBA")

    alpha = image.getchannel("A")
    arr = np.array(image)
    mask = arr[:, :, 3] > 0

    if not np.any(mask):
        return image

    opaque_pixels = arr[mask, :3]
    # Se já tiver menos ou igual a num_colors, não precisa forçar
    if len(np.unique(opaque_pixels, axis=0)) <= num_colors:
        return image

    # Cria imagem temporária para gerar a paleta ótima focada no personagem
    sample_size = min(len(opaque_pixels), 20000)
    idx = np.random.choice(len(opaque_pixels), sample_size, replace=False) if len(opaque_pixels) > 20000 else slice(None)
    samples = opaque_pixels[idx]

    dummy = Image.fromarray(samples.reshape(-1, 1, 3).repeat(10, axis=1), mode="RGB")
    palette_img = dummy.quantize(colors=num_colors, dither=Image.Dither.NONE)

    # Aplica a paleta calibrada na imagem completa
    quantized = image.convert("RGB").quantize(palette=palette_img, dither=Image.Dither.NONE).convert("RGBA")
    quantized.putalpha(alpha)
    return quantized

def align_to_canvas_bottom_center(
    img: Image.Image,
    canvas_size: int = 96,
    scale: float | None = None,
    feet_y: int | None = None
) -> Image.Image:
    """
    Redimensiona a imagem inteira usando o fator de escala proporcional fixo (NEAREST)
    e cola no canvas centralizado na horizontal e ancorado nos pés.
    """
    w, h = img.size
    if scale is None:
        scale = min(canvas_size / w, canvas_size / h)

    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))

    resized = img.resize((new_w, new_h), resample=Image.Resampling.NEAREST)

    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    paste_x = (canvas_size - new_w) // 2
    if feet_y is not None:
        paste_y = (canvas_size - 4) - int(round(feet_y * scale))
    else:
        paste_y = canvas_size - new_h

    canvas.paste(resized, (paste_x, paste_y), mask=resized)
    return canvas

def process_single_frame(
    cell_img: Image.Image,
    canvas_size: int = 96,
    tolerance: float = 38.0,
    num_colors: int = 24,
    scale: float | None = None,
    feet_y: int | None = None,
    is_airborne: bool = False
) -> Image.Image:
    """Processa um quadro com pré-processamento de contraste e limpeza."""
    # 1. Remoção limpa de fundo (sem apagar pretos internos)
    cleaned = remove_background_cleanly(cell_img, tolerance=tolerance, erode_pixels=1)

    # 1.1 Remove fragmentos e ilhas flutuantes vazadas de outras linhas/colunas
    cleaned = remove_disconnected_top_islands(cleaned, is_airborne=is_airborne)
    cleaned = remove_disconnected_left_islands(cleaned)

    # 2. Realce de vivacidade e contraste
    enhanced = enhance_vibrancy_and_contrast(cleaned)

    # 3. Redimensionamento uniforme com escala travada (sem corte/trim individual)
    aligned = align_to_canvas_bottom_center(enhanced, canvas_size=canvas_size, scale=scale, feet_y=feet_y)

    # 4. Quantização inteligente para 24 cores sem dithering
    final_img = quantize_smart_24_colors(aligned, num_colors=num_colors)
    return final_img

def process_base_sheet(
    out_dir: Path,
    canvas_size: int = 96,
    tolerance: float = 38.0,
    num_colors: int = 24
):
    """
    Processa a folha oficial base do Viking com cores vivas e proporções travadas.
    """
    print(f"\n[BASE VIKING] Processando folha base em {canvas_size}x{canvas_size} com pré-processamento de contraste...")

    possible_sources = [
        Path("public/assets/viking-art.png"),
        Path("C:/Users/IEADAM/.gemini/antigravity/scratch/jogo-vicking/public/assets/viking-art.png"),
        Path("docs/arte/sheet-base.png"),
        Path("C:/Users/IEADAM/.gemini/antigravity/scratch/jogo-vicking/docs/arte/sheet-base.png"),
    ]
    src_path = next((p for p in possible_sources if p.exists()), None)
    if not src_path:
        print("Erro: Nenhuma imagem de arte base encontrada.")
        return

    print(f"  Fonte: {src_path}")
    src_img = Image.open(src_path).convert("RGBA")

    row_names = ["idle", "walk", "run", "jump", "attack"]
    use_art = "viking-art" in src_path.name
    cell_src = 224 if use_art else None

    # Escala uniforme proporcional para manter a estatura exata em todos os movimentos
    uniform_scale = canvas_size / 224.0 if use_art else canvas_size / 138.0

    out_dir.mkdir(parents=True, exist_ok=True)
    grid_sheet = Image.new("RGBA", (canvas_size * 6, canvas_size * len(row_names)), (0, 0, 0, 0))

    y_spans = [(24, 147), (158, 280), (294, 404), (406, 548), (528, 678)]
    cols_spans = [
        [(50, 136), (208, 304), (372, 472), (542, 639), (706, 805), (880, 970)],
        [(32, 138), (190, 308), (356, 476), (520, 642), (696, 810), (862, 976)],
        [(20, 184), (190, 352), (352, 520), (518, 686), (686, 850), (852, 1018)],
        [(48, 128), (204, 302), (360, 500), (520, 675), (685, 815), (856, 986)],
        [(20, 166), (166, 350), (330, 506), (506, 695), (676, 850), (836, 976)],
    ]

    total = 0
    for r_idx, r_name in enumerate(row_names):
        for c_idx in range(6):
            if use_art:
                raw_cell = src_img.crop((c_idx * cell_src, r_idx * cell_src, (c_idx + 1) * cell_src, (r_idx + 1) * cell_src))
            else:
                y0, y1 = y_spans[r_idx]
                x0, x1 = cols_spans[r_idx][c_idx]
                raw_cell = src_img.crop((x0, y0, x1 + 1, y1 + 1))

            final_frame = process_single_frame(
                raw_cell,
                canvas_size=canvas_size,
                tolerance=tolerance,
                num_colors=num_colors,
                scale=uniform_scale,
                feet_y=196 if use_art else 120,
                is_airborne=(r_name == "jump")
            )

            frame_name = f"viking_base_{r_name}_{c_idx}.png"
            final_frame.save(out_dir / frame_name, format="PNG")
            grid_sheet.paste(final_frame, (c_idx * canvas_size, r_idx * canvas_size))
            total += 1

    sheet_path = out_dir / "viking_base_96.png"
    grid_sheet.save(sheet_path, format="PNG")

    meta = {
        "cell": canvas_size,
        "cols": 6,
        "rows": 5,
        "anims": {
            "idle": {"row": 0, "frames": 6, "loop": True, "fps": 6},
            "walk": {"row": 1, "frames": 6, "loop": True, "stride": 64, "steps": [0, 0.5]},
            "run": {"row": 2, "frames": 6, "loop": True, "stride": 88, "steps": [0, 0.5]},
            "jump": {"row": 3, "frames": 6, "loop": False},
            "attack": {
                "row": 4,
                "frames": 6,
                "loop": False,
                "durations": [0.05, 0.08, 0.06, 0.09, 0.08, 0.09],
                "hitFrame": 3
            }
        }
    }
    json_path = out_dir / "viking_base_96.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    print(f"  [OK] {total} quadros processados com sucesso em {out_dir}")
    print(f"  [OK] Sheet consolidada: {sheet_path}")
    print(f"  [OK] Metadados: {json_path}")

def process_file_or_grid(
    file_path: Path,
    out_dir: Path,
    canvas_size: int = 96,
    grid: tuple[int, int] | None = None,
    tolerance: float = 38.0,
    num_colors: int = 24
):
    """Processa um arquivo individual ou fatiado por grade."""
    print(f"\nProcessando imagem: {file_path.name}")
    try:
        with Image.open(file_path) as img:
            base_name = file_path.stem
            out_dir.mkdir(parents=True, exist_ok=True)

            if grid:
                cols, rows = grid
                w, h = img.size
                cell_w = w // cols
                cell_h = h // rows
                print(f"  Grade: {cols}x{rows} (células de {cell_w}x{cell_h}px) -> escala travada")

                scale = min(canvas_size / cell_w, canvas_size / cell_h)

                for r in range(rows):
                    for c in range(cols):
                        box = (c * cell_w, r * cell_h, (c + 1) * cell_w, (r + 1) * cell_h)
                        cell = img.crop(box)
                        frame = process_single_frame(
                            cell,
                            canvas_size=canvas_size,
                            tolerance=tolerance,
                            num_colors=num_colors,
                            scale=scale
                        )
                        out_name = f"{base_name}_{r}_{c}.png" if rows > 1 else f"{base_name}_{c}.png"
                        out_path = out_dir / out_name
                        frame.save(out_path, format="PNG")
                        print(f"    Salvo: {out_name}")
            else:
                scale = min(canvas_size / img.width, canvas_size / img.height)
                frame = process_single_frame(
                    img,
                    canvas_size=canvas_size,
                    tolerance=tolerance,
                    num_colors=num_colors,
                    scale=scale
                )
                out_path = out_dir / f"{base_name}.png"
                frame.save(out_path, format="PNG")
                print(f"  Salvo: {out_path.name}")

    except Exception as e:
        print(f"  [ERRO] Falha ao processar {file_path.name}: {e}")

def main():
    parser = argparse.ArgumentParser(
        description="Processa sprites: proporção uniforme, contraste e cores vivas sem apagar detalhes internos, NEAREST e 24 cores."
    )
    parser.add_argument(
        "--input", "-i",
        type=str,
        default="docs/arte/fury-pintada",
        help="Pasta ou arquivo de entrada"
    )
    parser.add_argument(
        "--output", "-o",
        type=str,
        default="assets/sprites_ready",
        help="Pasta de saída para os sprites prontos"
    )
    parser.add_argument(
        "--tolerance", "-t",
        type=float,
        default=38.0,
        help="Tolerância de cor para remoção do fundo (padrão: 38.0)"
    )
    parser.add_argument(
        "--grid", "-g",
        type=str,
        default=None,
        help="Grade para fatiar sprite sheet, formato COLSxROWS (ex: 6x1)"
    )
    parser.add_argument(
        "--base-sheet",
        action="store_true",
        help="Processa diretamente a folha base oficial do Viking com proporção uniforme em 96x96."
    )
    parser.add_argument(
        "--size", "-s",
        type=int,
        default=96,
        help="Tamanho do canvas final quadrado em pixels (padrão: 96)"
    )
    parser.add_argument(
        "--colors", "-c",
        type=int,
        default=24,
        help="Quantidade de cores para quantização (padrão: 24)"
    )

    args = parser.parse_args()
    out_dir = Path(args.output)

    if args.base_sheet:
        process_base_sheet(
            out_dir=out_dir,
            canvas_size=args.size,
            tolerance=args.tolerance,
            num_colors=args.colors
        )
        return

    input_path = Path(args.input)
    grid_tuple = None
    if args.grid:
        try:
            parts = args.grid.lower().split("x")
            grid_tuple = (int(parts[0]), int(parts[1]))
        except Exception:
            print(f"Erro: grade inválida '{args.grid}'. Use COLSxROWS (ex: 6x1)")
            sys.exit(1)

    if not input_path.exists():
        print(f"Erro: caminho '{input_path}' não encontrado.")
        sys.exit(1)

    if input_path.is_file():
        files = [input_path]
    else:
        files = sorted([
            p for p in input_path.iterdir()
            if p.is_file() and p.suffix.lower() in VALID_EXTENSIONS
        ])

    print(f"Processando {len(files)} arquivo(s) de {input_path}...")
    for f in files:
        with Image.open(f) as temp_im:
            w, h = temp_im.size
            current_grid = grid_tuple
            if not current_grid and w >= h * 3:
                current_grid = (6, 1)

        process_file_or_grid(
            file_path=f,
            out_dir=out_dir,
            canvas_size=args.size,
            grid=current_grid,
            tolerance=args.tolerance,
            num_colors=args.colors
        )

    print("\nProcessamento finalizado com sucesso!")

if __name__ == "__main__":
    main()
