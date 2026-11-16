#!/usr/bin/env python3
"""
Processador de Sprites por Componentes Conectados (Ilhas de Pixels):
1. Remoção de fundo e limpeza de ruído (despeckle < 15px) na imagem inteira antes de fatiar.
2. Segmentação por Bounding Box Real via cv2.connectedComponentsWithStats / scipy.ndimage.label:
   - Separa faixas horizontais (linhas) primeiro para nunca juntar com a linha de cima ou de baixo.
   - Agrupa componentes próximos do mesmo golpe (personagem + efeito de corte/raio/magia).
   - Extrai cada frame usando a máscara exata dos componentes agrupados + bounding box real com padding de 4px.
   - Ordena os frames da esquerda para a direita, de cima para baixo.
3. Escala Única Global e Alinhamento:
   - Calcula a maior largura e maior altura entre os frames extraídos para definir uma única escala global.
   - Redimensiona todos os frames com exatamente o mesmo fator (Image.Resampling.NEAREST), mantendo 100% da proporção.
   - Cola cada frame em um canvas transparente uniforme (padrão 128x128), alinhado pela base inferior (pés)
     e centralizado horizontalmente pelo corpo do personagem (com proteção de borda para nunca cortar efeitos largos).
4. Validação:
   - Gera debug_boxes.png desenhando os retângulos vermelhos onde cada frame foi detectado na folha original.
"""

import argparse
import json
import os
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance
from scipy import ndimage

VALID_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}


def remove_background_and_despeckle(
    image: Image.Image,
    tolerance: float = 38.0,
    min_island_area: int = 15,
    extra_fg_mask: np.ndarray | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Converte a imagem inteira para RGBA, remove a cor de fundo (detectada automaticamente
    pelas bordas com tolerância para eliminar halos) e apaga qualquer ilha desconectada
    com área menor que `min_island_area` pixels (alpha = 0).

    Retorna:
      - clean_rgba: array uint8 (H, W, 4) limpo e sem ruído
      - fg_mask: array bool (H, W) indicando pixels visíveis (alpha > 0)
    """
    rgba = np.array(image.convert("RGBA"), dtype=np.uint8)
    h, w, _ = rgba.shape
    r = rgba[:, :, 0].astype(np.int16)
    g = rgba[:, :, 1].astype(np.int16)
    b = rgba[:, :, 2].astype(np.int16)
    a = rgba[:, :, 3].astype(np.int16)

    # Amostra pixels das 4 bordas da folha inteira
    border_alphas = np.concatenate([a[0, :], a[-1, :], a[:, 0], a[:, -1]])
    border_r = np.concatenate([r[0, :], r[-1, :], r[:, 0], r[:, -1]])
    border_g = np.concatenate([g[0, :], g[-1, :], g[:, 0], g[:, -1]])
    border_b = np.concatenate([b[0, :], b[-1, :], b[:, 0], b[:, -1]])

    has_transparent_border = np.mean(border_alphas < 16) > 0.25
    is_green_chroma = (np.median(border_g) > 150) and (np.median(border_g) > np.median(border_r) + 50)

    if has_transparent_border:
        fg_mask = a > 20
        # Remove eventuais resíduos escuros azulados de borda
        residual_bg = (b > r + 8) & (b > g + 8) & (r < 85) & (g < 85) & (b < 130) & (a < 180)
        fg_mask = fg_mask & (~residual_bg)
    elif is_green_chroma:
        bg_med = np.array([np.median(border_r), np.median(border_g), np.median(border_b)], dtype=np.float32)
        dist = np.sqrt(
            (r.astype(np.float32) - bg_med[0]) ** 2
            + (g.astype(np.float32) - bg_med[1]) ** 2
            + (b.astype(np.float32) - bg_med[2]) ** 2
        )
        is_green = ((g > r + 20) & (g > b + 20) & (g > 55)) | (dist <= tolerance)
        fg_mask = ~is_green
        # Erosão de 1px na borda externa do chroma verde + despill para eliminar halos verdes
        fg_mask = ndimage.binary_erosion(fg_mask, iterations=1)
        green_spill = fg_mask & (g > np.maximum(r, b) + 8)
        rgba[green_spill, 1] = np.maximum(r[green_spill], b[green_spill]).astype(np.uint8)
    else:
        # Fundo escuro / vinheta azul-ardósia nórdica (sheet-base, sheet-thunder, fury-pintada, etc.)
        bg_med = np.array([np.median(border_r), np.median(border_g), np.median(border_b)], dtype=np.float32)
        dist_border = np.sqrt(
            (r.astype(np.float32) - bg_med[0]) ** 2
            + (g.astype(np.float32) - bg_med[1]) ** 2
            + (b.astype(np.float32) - bg_med[2]) ** 2
        )

        # Característica exata do fundo/vinheta azulada: canal azul dominante sobre R e G, tom médio-escuro
        is_vignette_bg = (b > r + 5) & (b > g + 5) & (r < 95) & (g < 95) & (b < 140)

        # Protege contorno preto firme, tons quentes do viking (barba, pele, couro, capa), aço e efeitos claros
        is_dark_outline = (r < 34) & (g < 31) & (b < 41) & ((b - r) < 11)
        is_warm_char = (r >= b - 4) & ((r > 28) | (g > 26))
        is_bright_fx = (b >= 140) | (g >= 115) | (r >= 105)

        is_bg = (is_vignette_bg | (dist_border <= tolerance * 0.55)) & (~is_dark_outline) & (~is_warm_char) & (~is_bright_fx)
        fg_mask = ~is_bg

        # Limpa eventuais artefatos de borda externa da folha (primeiros/últimos 4px)
        fg_mask[:4, :] = False
        fg_mask[-4:, :] = False
        fg_mask[:, :4] = False
        fg_mask[:, -4:] = False

        # Suavização de halo nas bordas de contato com o fundo azulado
        bg_dilated = ndimage.binary_dilation(is_bg, iterations=1)
        edge_zone = fg_mask & bg_dilated
        # Remove pixels de halo azulado fraco na borda externa
        weak_halo = edge_zone & (b > r + 3) & (b > g + 2) & (b < 155) & (r < 105)
        fg_mask[weak_halo] = False

        if extra_fg_mask is not None and extra_fg_mask.shape == fg_mask.shape:
            fg_mask = fg_mask | extra_fg_mask

    # Aplica máscara alfa limpa
    clean_rgba = rgba.copy()
    clean_rgba[~fg_mask, 3] = 0

    # Despeckle: remove qualquer ilha desconectada com área < min_island_area (padrão: 15px)
    structure_8 = np.ones((3, 3), dtype=np.int32)
    labeled, num_features = ndimage.label(fg_mask, structure=structure_8)
    if num_features > 0:
        counts = np.bincount(labeled.ravel())
        small_labels = np.where(counts < min_island_area)[0]
        if len(small_labels) > 0:
            remove_mask = np.isin(labeled, small_labels)
            fg_mask[remove_mask] = False
            clean_rgba[remove_mask, 3] = 0

    return clean_rgba, fg_mask


def detect_row_bands(fg_mask: np.ndarray, expected_rows: int | None = None) -> list[tuple[int, int]]:
    """
    Encontra as faixas horizontais (linhas de animação) na folha inteira para garantir
    que componentes de uma linha NUNCA sejam agrupados com a linha de cima ou de baixo.
    """
    h, w = fg_mask.shape
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(fg_mask.astype(np.uint8), connectivity=8)

    # Usa os corpos principais (área >= 400) para localizar os centros verticais das linhas
    major_spans = []
    for i in range(1, num_labels):
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area >= 400:
            y0 = int(stats[i, cv2.CC_STAT_TOP])
            y1 = y0 + int(stats[i, cv2.CC_STAT_HEIGHT])
            major_spans.append((y0, y1, area))

    if not major_spans:
        return [(0, h)]

    # Se for folha padrão de 5 linhas (~687px de altura), encontra os vales horizontais exatos entre as 5 linhas
    row_density = np.sum(fg_mask, axis=1)
    if expected_rows == 5 or (expected_rows is None and h >= 550 and len(major_spans) >= 15):
        # Janelas aproximadas onde ficam os vales entre as 5 linhas das folhas 1024x687
        valley_windows = [(135, 165), (272, 302), (392, 418), (540, 560)]
        splits = [0]
        for wy0, wy1 in valley_windows:
            wy0_c = max(1, min(h - 2, wy0))
            wy1_c = max(wy0_c + 1, min(h - 1, wy1))
            best_y = wy0_c + int(np.argmin(row_density[wy0_c:wy1_c]))
            splits.append(best_y)
        splits.append(h)
        return [(splits[i], splits[i + 1]) for i in range(len(splits) - 1)]

    # Agrupamento automático de faixas Y por sobreposição vertical dos componentes principais
    major_spans.sort(key=lambda item: (item[0] + item[1]) / 2.0)
    bands: list[list[int]] = []
    for y0, y1, _ in major_spans:
        cy = 0.5 * (y0 + y1)
        if not bands:
            bands.append([y0, y1])
        else:
            prev_y0, prev_y1 = bands[-1]
            prev_cy = 0.5 * (prev_y0 + prev_y1)
            overlap = min(y1, prev_y1) - max(y0, prev_y0)
            if overlap > 12 or abs(cy - prev_cy) < 55:
                bands[-1][0] = min(prev_y0, y0)
                bands[-1][1] = max(prev_y1, y1)
            else:
                bands.append([y0, y1])

    if len(bands) <= 1:
        return [(0, h)]

    splits = [0]
    for i in range(len(bands) - 1):
        search_y0 = max(1, min(bands[i][1] - 6, bands[i + 1][0]))
        search_y1 = min(h - 1, max(bands[i][1], bands[i + 1][0] + 6) + 1)
        if search_y1 > search_y0:
            valley_y = search_y0 + int(np.argmin(row_density[search_y0:search_y1]))
        else:
            valley_y = (bands[i][1] + bands[i + 1][0]) // 2
        splits.append(valley_y)
    splits.append(h)
    return [(splits[i], splits[i + 1]) for i in range(len(splits) - 1)]


def segment_row_into_frames(
    clean_rgba: np.ndarray,
    fg_mask: np.ndarray,
    ry0: int,
    ry1: int,
    expected_cols: int = 6,
    padding: int = 4,
    min_island_area: int = 15,
) -> list[dict]:
    """
    Dentro da faixa horizontal [ry0, ry1]:
    1. Encontra todas as ilhas conectadas (connectedComponentsWithStats).
    2. Se uma ilha conectada unir o arco de corte brilhante de um frame com a capa escura do
       frame vizinho (ex: attackCombo frame 2 e 3, ou feixe de raio longo), separa o efeito
       brilhante do corpo escuro sem fazer corte reto no efeito!
    3. Agrupa componentes próximos pertencentes ao mesmo frame (personagem + efeito daquele golpe).
    4. Retorna a lista de frames ordenados da esquerda para a direita com sua máscara exata e bounding box (+padding).
    """
    h, w, _ = clean_rgba.shape
    row_rgba = clean_rgba[ry0:ry1, :, :]
    row_fg = fg_mask[ry0:ry1, :].copy()
    rh = ry1 - ry0

    # Despeckle local na faixa após separação de linha
    lbl_row, n_row = ndimage.label(row_fg, structure=np.ones((3, 3), dtype=np.int32))
    if n_row > 0:
        counts = np.bincount(lbl_row.ravel())
        small = np.where(counts < min_island_area)[0]
        if len(small) > 0:
            row_fg[np.isin(lbl_row, small)] = False

    r = row_rgba[:, :, 0].astype(np.int16)
    g = row_rgba[:, :, 1].astype(np.int16)
    b = row_rgba[:, :, 2].astype(np.int16)

    # Verifica componentes conectados iniciais na faixa
    num_cc, cc_labels, cc_stats, _ = cv2.connectedComponentsWithStats(row_fg.astype(np.uint8), connectivity=8)

    # Construímos uma lista de sub-componentes elementares (mask, x0, y0, x1, y1, area, is_effect)
    # Se um componente for largo demais (> 178px em uma folha de 6 colunas) por encostar arco claro na capa vizinha,
    # separamos a máscara do arco claro da máscara do corpo escuro para não cortar o arco reto!
    elementary_comps = []

    for cid in range(1, num_cc):
        area = int(cc_stats[cid, cv2.CC_STAT_AREA])
        if area < min_island_area:
            continue
        cx0 = int(cc_stats[cid, cv2.CC_STAT_LEFT])
        cy0 = int(cc_stats[cid, cv2.CC_STAT_TOP])
        cw = int(cc_stats[cid, cv2.CC_STAT_WIDTH])
        ch = int(cc_stats[cid, cv2.CC_STAT_HEIGHT])
        cx1 = cx0 + cw
        cy1 = cy0 + ch
        comp_mask = cc_labels == cid

        if cw > 280 and expected_cols >= 6 and cx0 > 420 and cx1 > 780:
            # Feixe de raio extremo atravessando colunas 3 e 4 (ex: sheet-thunder.png Row 4, cw ~ 408)
            # Separa o frame 3 (explosão esférica + lança de raio) do frame 4 (viking batendo no chão)
            yy, xx = np.indices(row_fg.shape)
            gy = yy + ry0
            # Máscara elíptica suave e raios brancos/cianos da esfera do Frame 3 (sem corte reto!)
            nd_ellipse = np.sqrt(((xx - 626.0) / 52.0) ** 2 + ((gy - 602.0) / 56.0) ** 2)
            is_bright_core = (b > 165) & (g > 135) & (xx <= 692)
            c3_region = (xx <= 630) | (nd_ellipse <= 1.0) | is_bright_core
            # Remove o cunho de poeira do chão abaixo da esfera no Frame 3
            c3_mask = comp_mask & c3_region & (gy <= 662)

            # Para o Frame 4 (x >= 690), preserva o corpo do Viking e poeira do chão, sem o feixe horizontal vazado
            is_beam_bleed = (
                (gy < 588)
                | ((xx < 732) & (gy <= 638))
                | ((xx < 748) & (gy <= 616))
                | ((gy <= 608) & (((b > 155) & (g > 135)) | ((b > 115) & (b > r + 15))))
                | ((xx >= 792) & (gy <= 616) & ((b > 125) & (g > 100) | (b > r + 10)))
            )
            c4_mask = comp_mask & (xx >= 690) & (~is_beam_bleed)

            for sub_m, is_fx in [(c3_mask, False), (c4_mask, False)]:
                n_s, l_s, s_s, _ = cv2.connectedComponentsWithStats(sub_m.astype(np.uint8), connectivity=8)
                for sid in range(1, n_s):
                    s_area = int(s_s[sid, cv2.CC_STAT_AREA])
                    if s_area < min_island_area:
                        continue
                    sx0 = int(s_s[sid, cv2.CC_STAT_LEFT])
                    sy0 = int(s_s[sid, cv2.CC_STAT_TOP])
                    sw = int(s_s[sid, cv2.CC_STAT_WIDTH])
                    sh = int(s_s[sid, cv2.CC_STAT_HEIGHT])
                    s_mask = l_s == sid
                    elementary_comps.append({
                        "mask": s_mask,
                        "x0": sx0, "y0": sy0, "x1": sx0 + sw, "y1": sy0 + sh,
                        "area": s_area,
                        "is_effect": is_fx,
                    })
            continue
        elif cw > max(185, int((w / max(1, expected_cols)) * 1.35)) and expected_cols >= 6 and ry0 < 500:
            # Caso geral para tiras de 6 colunas (ex: docs/arte/fury-pintada/attack.png) onde o arco
            # brilhante de fogo/corte encosta no personagem vizinho: separa o arco/chama do corpo
            # para identificar os 6 corpos sem cortar o arco em linha reta!
            is_bright_slash = comp_mask & (
                ((r > 185) & (g > 110) & (b > 90))
                | ((r > 175) & (g > 60) & (r > b + 50))
                | ((r > g + 42) & (r > b + 42) & (r > 120))
                | ((b > 135) & (g > 105) & (b > r + 14))
            )
            is_dark_body = comp_mask & (~is_bright_slash)
            # Se o componente ainda for muito largo (> 280px), separa também a aura vermelha externa
            # nas fronteiras entre colunas onde a chama de um frame encosta na chama do vizinho
            if cw > 280:
                col_step = w / float(expected_cols)
                yy_c, xx_c = np.indices(row_fg.shape)
                # Para attack.png (1024x254), a fronteira entre col 1/2 é ~336 e col 2/3 é ~546 (após o arco)
                cut_xs = [int(round(col_b * col_step)) for col_b in range(1, expected_cols)]
                if w == 1024 and expected_cols == 6:
                    cut_xs = [168, 362, 565, 720, 885]
                for bx in cut_xs:
                    near_b = np.abs(xx_c - bx) <= 2
                    is_dark_body = is_dark_body & (~near_b)
                    near_fx_b = (np.abs(xx_c - bx) <= 2) & (~((r > 200) & (g > 110)))
                    is_bright_slash = is_bright_slash & (~near_fx_b)

            for sub_m, is_fx in [(is_dark_body, False), (is_bright_slash, True)]:
                n_s, l_s, s_s, _ = cv2.connectedComponentsWithStats(sub_m.astype(np.uint8), connectivity=8)
                for sid in range(1, n_s):
                    s_area = int(s_s[sid, cv2.CC_STAT_AREA])
                    if s_area < min_island_area:
                        continue
                    sx0 = int(s_s[sid, cv2.CC_STAT_LEFT])
                    sy0 = int(s_s[sid, cv2.CC_STAT_TOP])
                    sw = int(s_s[sid, cv2.CC_STAT_WIDTH])
                    sh = int(s_s[sid, cv2.CC_STAT_HEIGHT])
                    elementary_comps.append({
                        "mask": (l_s == sid),
                        "x0": sx0, "y0": sy0, "x1": sx0 + sw, "y1": sy0 + sh,
                        "core_x0": sx0, "core_x1": sx0 + sw,
                        "area": s_area,
                        "is_effect": is_fx,
                    })
            continue
        elif cw > 170 and expected_cols >= 6 and ry0 > 500 and cx0 < 480 and cx1 > 580:
            # Caso específico do Frame 3 de attackCombo (sheet-base-attacks / sheet-thunder-attacks):
            # Remove o arco de corte que aparece atrás das costas do Viking (à esquerda da capa, x < 540),
            # preservando 100% do corpo/capa do Viking e o machado à frente.
            yy, xx = np.indices(row_fg.shape)
            is_back_slash = (
                (xx < 510)
                | ((xx < 542) & (
                    ((r > 115) & (g > 115) & (b > 115))
                    | ((b > 105) & (g > 85) & (b > r + 10))
                ))
            )
            clean_m = comp_mask & (~is_back_slash)
            n_s, l_s, s_s, _ = cv2.connectedComponentsWithStats(clean_m.astype(np.uint8), connectivity=8)
            for sid in range(1, n_s):
                s_area = int(s_s[sid, cv2.CC_STAT_AREA])
                if s_area < min_island_area:
                    continue
                sx0 = int(s_s[sid, cv2.CC_STAT_LEFT])
                sy0 = int(s_s[sid, cv2.CC_STAT_TOP])
                sw = int(s_s[sid, cv2.CC_STAT_WIDTH])
                sh = int(s_s[sid, cv2.CC_STAT_HEIGHT])
                elementary_comps.append({
                    "mask": (l_s == sid),
                    "x0": sx0, "y0": sy0, "x1": sx0 + sw, "y1": sy0 + sh,
                    "core_x0": sx0, "core_x1": sx0 + sw,
                    "area": s_area,
                    "is_effect": False,
                })
            continue
        else:
            # Classifica se o componente é majoritariamente efeito brilhante ou corpo do personagem
            # IMPORTANTE: se o componente já une o personagem + seu arco de corte (ex: attackCombo frame 3,
            # x=430..621, cw=188..191), mantemos a ilha 100% intacta para nunca cortar o arco e nem colar
            # a ponta do arco no frame anterior!
            comp_r = r[comp_mask]
            comp_g = g[comp_mask]
            comp_b = b[comp_mask]
            bright_ratio = np.mean(
                ((comp_r > 140) & (comp_g > 140) & (comp_b > 140))
                | ((comp_b > 135) & (comp_g > 105) & (comp_b > comp_r + 14))
            )
            # Localiza a faixa X real do corpo escuro/quente dentro do componente (útil quando o componente
            # inclui um arco largo à esquerda ou direita do corpo)
            dark_or_warm = comp_mask & (
                ((r < 130) & (g < 120) & (b < 130))
                | ((r >= b - 2) & (r > 35) & (b < 130))
            )
            if np.sum(dark_or_warm) >= 250:
                _, dw_xs = np.where(dark_or_warm)
                core_x0 = int(np.percentile(dw_xs, 5))
                core_x1 = int(np.percentile(dw_xs, 98)) + 1
            else:
                core_x0, core_x1 = cx0, cx1

            elementary_comps.append({
                "mask": comp_mask,
                "x0": cx0, "y0": cy0, "x1": cx1, "y1": cy1,
                "core_x0": core_x0, "core_x1": core_x1,
                "area": area,
                "is_effect": bool(bright_ratio > 0.65 and area < 4500),
            })

    if not elementary_comps:
        return []

    # Garante que todos os componentes tenham core_x0 e core_x1 preenchidos
    for c in elementary_comps:
        if "core_x0" not in c:
            c["core_x0"] = c["x0"]
            c["core_x1"] = c["x1"]

    # Passo A: Seleciona 1 núcleo principal de personagem (seed) por coluna esperada
    # (sem cortar por grade: apenas identifica o corpo principal de cada coluna para agrupar as ilhas completas ao redor dele)
    body_candidates = [c for c in elementary_comps if not c["is_effect"] and c["area"] >= 280]
    if len(body_candidates) < expected_cols:
        body_candidates = [c for c in elementary_comps if c["area"] >= 150]

    seeds: list[dict] = []
    if expected_cols > 1 and len(body_candidates) >= expected_cols:
        col_step = w / float(expected_cols)
        used_ids = set()
        for c_idx in range(expected_cols):
            target_cx = (c_idx + 0.5) * col_step
            # Procura os candidatos de corpo na vizinhança desta coluna e escolhe o de maior área/proximidade
            best_cand = None
            best_val = -1e9
            for cand in body_candidates:
                if id(cand) in used_ids:
                    continue
                cand_cx = 0.5 * (cand["core_x0"] + cand["core_x1"])
                dist = abs(cand_cx - target_cx)
                if dist <= col_step * 0.68:
                    val = cand["area"] - dist * 18.0
                    if val > best_val:
                        best_val = val
                        best_cand = cand
            if best_cand is not None:
                seeds.append(best_cand)
                used_ids.add(id(best_cand))

    if not seeds:
        body_candidates.sort(key=lambda c: c["area"], reverse=True)
        min_seed_dist = max(70.0, (w / max(1, expected_cols)) * 0.52)
        for cand in body_candidates:
            cand_cx = 0.5 * (cand["core_x0"] + cand["core_x1"])
            if all(abs(cand_cx - 0.5 * (s["core_x0"] + s["core_x1"])) >= min_seed_dist for s in seeds):
                seeds.append(cand)
                if len(seeds) == expected_cols:
                    break

    seeds.sort(key=lambda s: 0.5 * (s["core_x0"] + s["core_x1"]))
    if not seeds:
        seeds = [max(elementary_comps, key=lambda c: c["area"])]

    clusters = [
        {
            "comps": [s],
            "body_x0": s["core_x0"],
            "body_x1": s["core_x1"],
            "body_y0": s["y0"],
            "body_y1": s["y1"],
            "x0": s["x0"],
            "y0": s["y0"],
            "x1": s["x1"],
            "y1": s["y1"],
        }
        for s in seeds
    ]
    seed_ids = {id(s) for s in seeds}

    # Passo B: Agrupa todos os demais componentes (partes do corpo, machados, cortes de ataque e raios)
    # ao personagem correto daquela mesma linha!
    remaining = [c for c in elementary_comps if id(c) not in seed_ids]
    remaining.sort(key=lambda c: c["area"], reverse=True)

    for comp in remaining:
        cx0, cx1 = comp["x0"], comp["x1"]
        cy0, cy1 = comp["y0"], comp["y1"]
        ccx = 0.5 * (cx0 + cx1)

        best_idx = -1
        best_score = float("inf")

        for idx, cl in enumerate(clusters):
            bx0, bx1 = cl["body_x0"], cl["body_x1"]
            bcx = 0.5 * (bx0 + bx1)

            # Verifica sobreposição horizontal direta com o corpo ou com os componentes já unidos ao cluster
            overlap_body = min(cx1, bx1) - max(cx0, bx0)
            overlap_cluster = min(cx1, cl["x1"]) - max(cx0, cl["x0"])
            overlap = max(overlap_body, overlap_cluster)

            if overlap > 0:
                # Sobreposição direta com o personagem/cluster: prioridade máxima absoluta!
                score = -1000.0 - overlap * 10.0 + abs(ccx - bcx) * 0.15
            elif comp["is_effect"] and bx0 - 14 <= cx0 <= bx1 + 6:
                # Arco de corte que nasce no corpo do personagem k e se projeta à frente
                score = -500.0 + abs(cx0 - bcx) * 0.2
            elif cx0 >= bx1:
                # Componente à DIREITA (na frente) do personagem idx (ex: machado estendido / giro frontal):
                gap_right = min(cx0 - bx1, max(0, cx0 - cl["x1"]))
                next_x0 = clusters[idx + 1]["body_x0"] if idx + 1 < len(clusters) else w
                gap_to_next = next_x0 - cx1
                # Se está na frente do personagem idx (gap_right <= 30) e não toca o próximo viking (gap_to_next >= 6),
                # pertence ao golpe frontal de idx!
                if gap_right <= 30 and gap_to_next >= 6:
                    score = -200.0 + gap_right * 0.5
                else:
                    score = gap_right * 1.35
            else:
                # Componente à ESQUERDA (atrás) do personagem idx:
                gap_left = min(bx0 - cx1, max(0, cl["x0"] - cx1))
                prev_x1 = clusters[idx - 1]["x1"] if idx > 0 else -999
                gap_from_prev = cx0 - prev_x1
                # Se está colado à capa/pés traseiros de idx e longe do golpe frontal do viking anterior
                if gap_left <= 20 and gap_from_prev > 30:
                    score = gap_left * 0.45
                else:
                    score = gap_left * 1.6

            if score < best_score:
                best_score = score
                best_idx = idx

        # Ignora ruído isolado distante de qualquer personagem (> 95px)
        if best_idx == -1 or best_score > 110:
            continue

        # Descarta resquícios pequenos do arco traseiro do attackCombo (frame 3) ou faíscas do feixe acima do frame 4
        if ry0 > 500 and comp["area"] < 140:
            if best_idx == 3 and cx1 < 530 and (cy1 + ry0) < 630:
                continue
            if best_idx == 4 and (cy1 + ry0) < 592:
                continue

        target = clusters[best_idx]
        target["comps"].append(comp)
        target["x0"] = min(target["x0"], comp["x0"])
        target["y0"] = min(target["y0"], comp["y0"])
        target["x1"] = max(target["x1"], comp["x1"])
        target["y1"] = max(target["y1"], comp["y1"])
        if not comp["is_effect"] and comp["area"] >= 220 and abs(ccx - 0.5 * (target["body_x0"] + target["body_x1"])) <= 45:
            target["body_x0"] = min(target["body_x0"], comp["x0"])
            target["body_x1"] = max(target["body_x1"], comp["x1"])
            target["body_y0"] = min(target["body_y0"], comp["y0"])
            target["body_y1"] = max(target["body_y1"], comp["y1"])

    # Passo C: Monta o resultado de cada frame da linha com máscara exata + padding de 4px
    frames_out = []
    for col_idx, cl in enumerate(clusters):
        cluster_mask = np.zeros((rh, w), dtype=bool)
        for comp in cl["comps"]:
            cluster_mask |= comp["mask"]

        ys, xs = np.where(cluster_mask)
        if len(xs) == 0:
            continue

        raw_x0, raw_x1 = int(xs.min()), int(xs.max()) + 1
        raw_y0, raw_y1 = int(ys.min()) + ry0, int(ys.max()) + 1 + ry0

        pad_x0 = max(0, raw_x0 - padding)
        pad_y0 = max(ry0, raw_y0 - padding)
        pad_x1 = min(w, raw_x1 + padding)
        pad_y1 = min(ry1, raw_y1 + padding)

        # Extrai o recorte RGBA contendo APENAS os componentes conectados deste frame (zero vazamento!)
        crop_h = pad_y1 - pad_y0
        crop_w = pad_x1 - pad_x0
        frame_rgba = np.zeros((crop_h, crop_w, 4), dtype=np.uint8)

        local_y0 = pad_y0 - ry0
        local_y1 = pad_y1 - ry0
        sub_mask = cluster_mask[local_y0:local_y1, pad_x0:pad_x1]
        sub_rgba = row_rgba[local_y0:local_y1, pad_x0:pad_x1]
        frame_rgba[sub_mask] = sub_rgba[sub_mask]

        # Suaviza a borda direita da esfera elétrica do Frame 3 da linha 4 de sheet-thunder
        if cw_is_thunder_spear := (pad_x1 - pad_x0 > 200 and ry0 > 500 and col_idx == 3):
            yy_f, xx_f = np.indices((crop_h, crop_w))
            gx_f = xx_f + pad_x0
            gy_f = yy_f + pad_y0
            right_zone = sub_mask & (gx_f > 626)
            if np.any(right_zone):
                nd = np.sqrt(((gx_f - 626.0) / 52.0) ** 2 + ((gy_f - 602.0) / 56.0) ** 2)
                taper = np.clip((1.0 - nd) / 0.22, 0.0, 1.0)
                taper_zone = right_zone & (nd > 0.78)
                frame_rgba[taper_zone, 3] = (frame_rgba[taper_zone, 3].astype(np.float32) * taper[taper_zone]).astype(np.uint8)

        # Calcula o centro horizontal do corpo/barba (body_cx) e a base dos pés (foot_y) dentro do recorte
        fr = frame_rgba[:, :, 0].astype(np.int16)
        fg_c = frame_rgba[:, :, 1].astype(np.int16)
        fb = frame_rgba[:, :, 2].astype(np.int16)
        fa = frame_rgba[:, :, 3] > 0

        # Detecta pixels da barba ruiva / rosto / corpo para centralizar o boneco sem tremer
        beard_mask = fa & (fr > 125) & (fr > fg_c + 32) & (fg_c > fb + 8)
        warm_body_mask = fa & (fr >= fb - 2) & (fr > 35) & (fr < 195) & (fb < 130)

        if np.sum(beard_mask) >= 25:
            _, bxs = np.where(beard_mask)
            body_cx = float(np.mean(bxs)) - 4.0
        elif np.sum(warm_body_mask) >= 50:
            _, bxs = np.where(warm_body_mask)
            body_cx = float(np.mean(bxs))
        else:
            body_cx = crop_w / 2.0

        # Base dos pés (usa os pixels do corpo/botas próximos ao centro do personagem, ignorando arcos baixos)
        char_col_mask = fa & (np.abs(np.arange(crop_w)[None, :] - body_cx) <= 32) & (~((fb > 140) & (fg_c > 110)))
        if np.any(char_col_mask):
            c_ys, _ = np.where(char_col_mask)
            foot_y = float(np.percentile(c_ys, 98.5))
        else:
            foot_y = float((cl["body_y1"] + ry0) - pad_y0)

        frames_out.append({
            "col": col_idx,
            "bbox": (pad_x0, pad_y0, pad_x1, pad_y1),
            "raw_bbox": (raw_x0, raw_y0, raw_x1, raw_y1),
            "image": Image.fromarray(frame_rgba, mode="RGBA"),
            "width": crop_w,
            "height": crop_h,
            "body_cx": body_cx,
            "foot_y": foot_y,
            "global_foot_y": pad_y0 + foot_y,
        })

    return frames_out


def segment_sheet_connected_components(
    image: Image.Image,
    tolerance: float = 38.0,
    min_island_area: int = 15,
    padding: int = 4,
    expected_rows: int | None = None,
    expected_cols: int = 6,
    extra_fg_mask: np.ndarray | None = None,
) -> tuple[list[list[dict]], Image.Image, np.ndarray]:
    """
    Executa o pipeline completo de detecção de componentes conectados na folha inteira:
    1. Remove fundo e aplica despeckle (< 15px).
    2. Separa faixas de linha Y.
    3. Agrupa componentes de cada frame e extrai com padding de 4px.
    4. Gera a imagem de validação debug_boxes com retângulos vermelhos.
    """
    clean_rgba, fg_mask = remove_background_and_despeckle(
        image, tolerance=tolerance, min_island_area=min_island_area, extra_fg_mask=extra_fg_mask
    )
    row_bands = detect_row_bands(fg_mask, expected_rows=expected_rows)

    rows_frames: list[list[dict]] = []
    debug_img = image.convert("RGBA").copy()
    draw = ImageDraw.Draw(debug_img)

    for r_idx, (ry0, ry1) in enumerate(row_bands):
        row_frames = segment_row_into_frames(
            clean_rgba,
            fg_mask,
            ry0,
            ry1,
            expected_cols=expected_cols,
            padding=padding,
            min_island_area=min_island_area,
        )
        if not row_frames:
            continue
        rows_frames.append(row_frames)
        for f in row_frames:
            x0, y0, x1, y1 = f["bbox"]
            draw.rectangle([x0, y0, x1 - 1, y1 - 1], outline=(255, 0, 0, 255), width=2)

    return rows_frames, debug_img, fg_mask


def render_frame_on_uniform_canvas(
    frame_info: dict,
    global_scale: float,
    canvas_size: int = 128,
    foot_anchor_y: int | None = None,
    row_foot_y: float | None = None,
    is_airborne: bool = False,
) -> Image.Image:
    """
    Redimensiona o frame usando o fator de escala único global (Image.Resampling.NEAREST)
    e cola no canvas transparente uniforme (ex: 128x128), alinhado pela base inferior (pés)
    e centralizado horizontalmente pelo corpo do personagem, garantindo que nenhum efeito
    largo seja cortado nas bordas do canvas.
    """
    img: Image.Image = frame_info["image"]
    w, h = img.size
    new_w = max(1, int(round(w * global_scale)))
    new_h = max(1, int(round(h * global_scale)))

    resized = img.resize((new_w, new_h), resample=Image.Resampling.NEAREST)

    if foot_anchor_y is None:
        foot_anchor_y = canvas_size - max(10, int(round(canvas_size * 0.11)))

    # Posição horizontal: centraliza o corpo do personagem no centro do canvas
    scaled_body_cx = int(round(frame_info["body_cx"] * global_scale))
    paste_x = (canvas_size // 2) - scaled_body_cx

    # Posição vertical: alinha pela linha dos pés da linha (ou pés individuais)
    if is_airborne and row_foot_y is not None:
        # Preserva a altura do pulo em relação ao solo da linha
        rel_foot_y = row_foot_y - frame_info["bbox"][1]
        scaled_foot_y = int(round(rel_foot_y * global_scale))
    elif row_foot_y is not None:
        rel_foot_y = row_foot_y - frame_info["bbox"][1]
        scaled_foot_y = int(round(rel_foot_y * global_scale))
    else:
        scaled_foot_y = int(round(frame_info["foot_y"] * global_scale))

    paste_y = foot_anchor_y - scaled_foot_y

    # Proteção estrita de bordas: garante que efeitos largos ou altos NUNCA sejam cortados pelo canvas
    if paste_x < 2:
        paste_x = 2
    elif paste_x + new_w > canvas_size - 2:
        paste_x = canvas_size - 2 - new_w

    if paste_y < 2:
        paste_y = 2
    elif paste_y + new_h > canvas_size - 2:
        paste_y = canvas_size - 2 - new_h

    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    canvas.paste(resized, (paste_x, paste_y), mask=resized)
    return canvas


def enhance_sprite_colors(image: Image.Image, is_thunder: bool = False) -> Image.Image:
    """Realce sutil de contraste e nitidez mantendo 100% dos detalhes do personagem."""
    if image.mode != "RGBA":
        image = image.convert("RGBA")
    alpha = image.getchannel("A")
    rgb = image.convert("RGB")
    sat = 1.16 if is_thunder else 1.12
    con = 1.12 if is_thunder else 1.10
    rgb = ImageEnhance.Color(rgb).enhance(sat)
    rgb = ImageEnhance.Contrast(rgb).enhance(con)
    out = rgb.convert("RGBA")
    out.putalpha(alpha)
    return out


def build_viking_sheets_from_raw(
    out_dir: Path,
    canvas_size: int = 128,
    tolerance: float = 38.0,
    padding: int = 4,
):
    """
    Processa diretamente as folhas brutas do Viking (Base e Modo Thor):
      - docs/arte/sheet-base.png
      - docs/arte/sheet-base-attacks.png
      - docs/arte/sheet-thunder.png
      - docs/arte/sheet-thunder-attacks.png
    usando detecção de componentes conectados, escala única global e geração de debug_boxes.png.
    """
    raw_paths = {
        "base": Path("docs/arte/sheet-base.png"),
        "base_attacks": Path("docs/arte/sheet-base-attacks.png"),
        "thunder": Path("docs/arte/sheet-thunder.png"),
        "thunder_attacks": Path("docs/arte/sheet-thunder-attacks.png"),
    }
    for k, p in raw_paths.items():
        if not p.exists():
            raise FileNotFoundError(f"Arquivo bruto não encontrado: {p}")

    print("\n=== SEGMENTANDO FOLHAS BRUTAS POR COMPONENTES CONECTADOS ===")
    segmented = {}
    debug_images = {}
    fg_masks = {}

    for key, path in raw_paths.items():
        img = Image.open(path).convert("RGBA")
        # Para sheet-thunder.png e sheet-thunder-attacks.png, protege 100% do corpo/capa do Viking
        # (que recebe luz azulada dos raios) usando a máscara dos corpos correspondentes do Base!
        extra_mask = None
        if key == "thunder" and "base" in fg_masks:
            extra_mask = fg_masks["base"].copy()
            # Na linha 4 col 3 de sheet-thunder (lança de raio), apenas o corpo do Viking e não o arco branco do base
            b_img = np.array(Image.open(raw_paths["base"]).convert("RGBA"))
            is_base_white_slash = (b_img[:, :, 0] > 170) & (b_img[:, :, 1] > 170) & (b_img[:, :, 2] > 170)
            extra_mask[545:, :] = fg_masks["base"][545:, :] & (~is_base_white_slash[545:, :])
        elif key == "thunder_attacks" and "base_attacks" in fg_masks:
            extra_mask = fg_masks["base_attacks"].copy()

        rows_frames, dbg_img, fg_m = segment_sheet_connected_components(
            img,
            tolerance=tolerance,
            min_island_area=15,
            padding=padding,
            expected_rows=5,
            expected_cols=6,
            extra_fg_mask=extra_mask,
        )
        segmented[key] = rows_frames
        debug_images[key] = dbg_img
        fg_masks[key] = fg_m
        total_f = sum(len(r) for r in rows_frames)
        print(f"  [{key}] {path.name}: {len(rows_frames)} linhas, {total_f} frames detectados")

    # Calcula a maior largura e a maior altura global entre todos os frames extraídos
    all_frames = [
        f
        for rows in segmented.values()
        for r in rows
        for f in r
    ]
    max_w = max(f["width"] for f in all_frames)
    max_h = max(f["height"] for f in all_frames)

    # Escala única global para que o maior frame caiba com folga dentro do canvas uniforme
    usable_span = canvas_size - 8
    global_scale = min(usable_span / float(max_w), usable_span / float(max_h))
    foot_anchor_y = canvas_size - max(12, int(round(canvas_size * 0.11)))

    print(f"  Maior frame extraído: {max_w}x{max_h}px -> Escala Única Global = {global_scale:.4f} (canvas {canvas_size}x{canvas_size})")

    out_dir.mkdir(parents=True, exist_ok=True)

    # Salva debug_boxes.png (combinando as folhas brutas com os retângulos vermelhos de detecção)
    for key, dbg_im in debug_images.items():
        dbg_im.save(out_dir / f"debug_boxes_{key}.png", format="PNG")

    # Cria um painel debug_boxes.png principal com as 4 folhas brutas para inspeção imediata
    w0, h0 = debug_images["base"].size
    combined_dbg = Image.new("RGBA", (w0 * 2, h0 * 2), (18, 22, 34, 255))
    combined_dbg.paste(debug_images["base"], (0, 0))
    combined_dbg.paste(debug_images["base_attacks"], (w0, 0))
    combined_dbg.paste(debug_images["thunder"], (0, h0))
    combined_dbg.paste(debug_images["thunder_attacks"], (w0, h0))
    combined_dbg.save(Path("debug_boxes.png"), format="PNG")
    combined_dbg.save(out_dir / "debug_boxes.png", format="PNG")
    print(f"  [OK] Imagem de validação salva em: debug_boxes.png e {out_dir / 'debug_boxes.png'}")

    # Auxiliar para renderizar uma linha inteira com a escala única global
    def render_row(row_frames: list[dict], is_airborne: bool = False, is_thunder: bool = False) -> list[Image.Image]:
        # Usa o percentil 80 dos pés da linha como linha de piso estável para não tremer verticalmente
        foot_ys = [f["global_foot_y"] for f in row_frames]
        row_foot_y = float(np.percentile(foot_ys, 85)) if is_airborne else float(np.median(foot_ys))
        rendered = []
        for f in row_frames:
            canvas_f = render_frame_on_uniform_canvas(
                f,
                global_scale=global_scale,
                canvas_size=canvas_size,
                foot_anchor_y=foot_anchor_y,
                row_foot_y=row_foot_y if not is_airborne else row_foot_y,
                is_airborne=is_airborne,
            )
            canvas_f = enhance_sprite_colors(canvas_f, is_thunder=is_thunder)
            rendered.append(canvas_f)
        while len(rendered) < 6:
            rendered.append(rendered[-1].copy())
        return rendered[:6]

    # Monta todas as linhas de animação para Base e Modo Thor
    base_rows = {
        "idle": render_row(segmented["base"][0], is_thunder=False),
        "walk": render_row(segmented["base"][1], is_thunder=False),
        "run": render_row(segmented["base"][2], is_thunder=False),
        "jump": render_row(segmented["base"][3], is_airborne=True, is_thunder=False),
        "attack": render_row(segmented["base"][4], is_thunder=False),
        "attackCombo": render_row(segmented["base_attacks"][4], is_thunder=False),
        "attackSpin": render_row(segmented["base_attacks"][1], is_thunder=False),
        "attackOverhead": render_row(segmented["base_attacks"][0], is_thunder=False),
        "attackPlunge": render_row(segmented["base_attacks"][3], is_airborne=True, is_thunder=False),
    }
    # Arremesso (throw), hurt e fall derivados com consistência de escala
    base_rows["throw"] = [
        base_rows["attack"][0],
        base_rows["attack"][1],
        base_rows["attackCombo"][3],
        base_rows["attack"][4],
        base_rows["attack"][5],
        base_rows["idle"][0],
    ]
    base_rows["hurt"] = [base_rows["jump"][0], base_rows["jump"][4]]
    base_rows["fall"] = [
        base_rows["jump"][4],
        base_rows["jump"][5],
        base_rows["attackPlunge"][4],
        base_rows["attackPlunge"][5],
    ]

    # Folha do Modo Thor (Thunder):
    # Ping-pong suave no idle para respiração contínua
    t_idle_raw = render_row(segmented["thunder"][0], is_thunder=True)
    t_idle = [t_idle_raw[0], t_idle_raw[1], t_idle_raw[2], t_idle_raw[3], t_idle_raw[2], t_idle_raw[1]]

    t_attack = render_row(segmented["thunder"][4], is_thunder=True)
    t_plunge = render_row(segmented["thunder_attacks"][3], is_airborne=True, is_thunder=True)
    # Substitui apenas o frame 4 de attack (onde o feixe do frame 3 cobriu o capacete na arte bruta)
    t_attack[4] = t_plunge[5]

    thunder_rows = {
        "idle": t_idle,
        "walk": render_row(segmented["thunder"][1], is_thunder=True),
        "run": render_row(segmented["thunder"][2], is_thunder=True),
        "jump": render_row(segmented["thunder"][3], is_airborne=True, is_thunder=True),
        "attack": t_attack,
        "attackCombo": render_row(segmented["thunder_attacks"][4], is_thunder=True),
        "attackSpin": render_row(segmented["thunder_attacks"][1], is_thunder=True),
        "attackOverhead": render_row(segmented["thunder_attacks"][0], is_thunder=True),
        "attackPlunge": t_plunge,
        "cast": t_attack,
    }
    thunder_rows["throw"] = [
        thunder_rows["attack"][0],
        thunder_rows["attack"][1],
        thunder_rows["attackCombo"][3],
        thunder_rows["attack"][4],
        thunder_rows["attack"][5],
        thunder_rows["idle"][0],
    ]
    thunder_rows["hurt"] = [thunder_rows["jump"][0], thunder_rows["jump"][4]]
    thunder_rows["fall"] = [
        thunder_rows["jump"][4],
        thunder_rows["jump"][5],
        thunder_rows["attackPlunge"][4],
        thunder_rows["attackPlunge"][5],
    ]

    # Extrai o machado giratório para a linha final (axe)
    axe_canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    viking_art_path = Path("public/assets/viking-art.png")
    if viking_art_path.exists():
        v_art = Image.open(viking_art_path).convert("RGBA")
        axe_crop = v_art.crop((0, 12 * 224, 224, 13 * 224))
        axe_canvas = axe_crop.resize((canvas_size, canvas_size), resample=Image.Resampling.NEAREST)

    base_rows["axe"] = [axe_canvas]
    thunder_rows["axe"] = [enhance_sprite_colors(axe_canvas, is_thunder=True)]

    # Escala de renderização no jogo para manter exatamente a mesma estatura visual na tela
    # (antigo: 96/224 = 0.42857 com scale 2.2 -> novo: global_scale com renderScale ajustado)
    render_scale = round(2.2 * (96.0 / 224.0) / global_scale, 4)
    axe_pivot = {"x": int(round(45 * canvas_size / 96.0)), "y": int(round(47 * canvas_size / 96.0))}

    # Salva folha consolidada e frames individuais do Base
    base_order = [
        "idle", "walk", "run", "jump", "attack", "attackCombo",
        "attackSpin", "attackOverhead", "attackPlunge", "throw", "hurt", "fall", "axe"
    ]
    base_sheet = Image.new("RGBA", (canvas_size * 6, canvas_size * len(base_order)), (0, 0, 0, 0))
    for r_idx, name in enumerate(base_order):
        frames = base_rows[name]
        for c_idx, frm in enumerate(frames):
            base_sheet.paste(frm, (c_idx * canvas_size, r_idx * canvas_size))
            if name != "axe":
                frm.save(out_dir / f"viking_base_{name}_{c_idx}.png", format="PNG")
    base_sheet.save(out_dir / "viking_base_96.png", format="PNG")

    base_meta = {
        "cell": canvas_size,
        "footY": foot_anchor_y,
        "renderScale": render_scale,
        "globalScale": round(global_scale, 4),
        "cols": 6,
        "rows": len(base_order),
        "anims": {
            "idle": {"row": 0, "frames": 6, "loop": True, "fps": 6},
            "walk": {"row": 1, "frames": 6, "loop": True, "stride": 64, "steps": [0, 0.5]},
            "run": {"row": 2, "frames": 6, "loop": True, "stride": 88, "steps": [0, 0.5]},
            "jump": {"row": 3, "frames": 6, "loop": False},
            "attack": {"row": 4, "frames": 6, "loop": False, "durations": [0.05, 0.08, 0.06, 0.09, 0.08, 0.09], "hitFrame": 3},
            "attackCombo": {"row": 5, "frames": 6, "loop": False, "durations": [0.06, 0.08, 0.07, 0.08, 0.08, 0.1], "hitFrames": [1, 2, 3], "hitFrame": 1},
            "attackSpin": {"row": 6, "frames": 6, "loop": False, "durations": [0.05, 0.05, 0.05, 0.06, 0.06, 0.07], "hitFrames": [1, 2, 3, 4], "hitFrame": 2},
            "attackOverhead": {"row": 7, "frames": 6, "loop": False, "durations": [0.06, 0.08, 0.07, 0.08, 0.08, 0.1], "hitFrame": 2},
            "attackPlunge": {"row": 8, "frames": 6, "loop": False, "durations": [0.06, 0.06, 0.08, 0.1, 0.08, 0.09], "hitFrame": 3},
            "throw": {"row": 9, "frames": 6, "loop": False, "durations": [0.06, 0.08, 0.05, 0.07, 0.08, 0.1], "hitFrame": 2},
            "hurt": {"row": 10, "frames": 2, "loop": False, "durations": [0.12, 0.18]},
            "fall": {"row": 11, "frames": 4, "loop": False, "durations": [0.12, 0.08, 0.08, 0.2]},
            "axe": {"row": 12, "frames": 1, "pivot": axe_pivot},
        },
    }
    with open(out_dir / "viking_base_96.json", "w", encoding="utf-8") as f:
        json.dump(base_meta, f, indent=2)

    # Salva folha consolidada e frames individuais do Modo Thor (Thunder)
    thunder_order = [
        "idle", "walk", "run", "jump", "attack", "attackCombo",
        "attackSpin", "attackOverhead", "attackPlunge", "cast", "throw", "hurt", "fall", "axe"
    ]
    thunder_sheet = Image.new("RGBA", (canvas_size * 6, canvas_size * len(thunder_order)), (0, 0, 0, 0))
    for r_idx, name in enumerate(thunder_order):
        frames = thunder_rows[name]
        for c_idx, frm in enumerate(frames):
            thunder_sheet.paste(frm, (c_idx * canvas_size, r_idx * canvas_size))
            if name != "axe":
                frm.save(out_dir / f"viking_thunder_{name}_{c_idx}.png", format="PNG")
    thunder_sheet.save(out_dir / "viking_thunder_96.png", format="PNG")

    thunder_meta = {
        "cell": canvas_size,
        "footY": foot_anchor_y,
        "renderScale": render_scale,
        "globalScale": round(global_scale, 4),
        "cols": 6,
        "rows": len(thunder_order),
        "anims": {
            "idle": {"row": 0, "frames": 6, "loop": True, "fps": 8},
            "walk": {"row": 1, "frames": 6, "loop": True, "stride": 64, "steps": [0, 0.5]},
            "run": {"row": 2, "frames": 6, "loop": True, "stride": 88, "steps": [0, 0.5]},
            "jump": {"row": 3, "frames": 6, "loop": False},
            "attack": {"row": 4, "frames": 6, "loop": False, "durations": [0.05, 0.08, 0.06, 0.09, 0.08, 0.09], "hitFrame": 3},
            "attackCombo": {"row": 5, "frames": 6, "loop": False, "durations": [0.06, 0.08, 0.07, 0.08, 0.08, 0.1], "hitFrames": [1, 2, 3], "hitFrame": 1},
            "attackSpin": {"row": 6, "frames": 6, "loop": False, "durations": [0.05, 0.05, 0.05, 0.06, 0.06, 0.07], "hitFrames": [1, 2, 3, 4], "hitFrame": 2},
            "attackOverhead": {"row": 7, "frames": 6, "loop": False, "durations": [0.06, 0.08, 0.07, 0.08, 0.08, 0.1], "hitFrame": 2},
            "attackPlunge": {"row": 8, "frames": 6, "loop": False, "durations": [0.06, 0.06, 0.08, 0.1, 0.08, 0.09], "hitFrame": 3},
            "cast": {"row": 9, "frames": 6, "loop": False, "durations": [0.05, 0.07, 0.07, 0.09, 0.08, 0.08], "hitFrame": 3},
            "throw": {"row": 10, "frames": 6, "loop": False, "durations": [0.06, 0.08, 0.05, 0.07, 0.08, 0.1], "hitFrame": 2},
            "hurt": {"row": 11, "frames": 2, "loop": False, "durations": [0.12, 0.18]},
            "fall": {"row": 12, "frames": 4, "loop": False, "durations": [0.12, 0.08, 0.08, 0.2]},
            "axe": {"row": 13, "frames": 1, "pivot": axe_pivot},
        },
    }
    with open(out_dir / "viking_thunder_96.json", "w", encoding="utf-8") as f:
        json.dump(thunder_meta, f, indent=2)

    print(f"  [OK] Folhas consolidadas geradas em: {out_dir / 'viking_base_96.png'} e {out_dir / 'viking_thunder_96.png'}")

    # Altura visual do Viking Base na tela (para manter 100% da proporção no Modo Surtur)
    base_idle_raw_h = float(np.median([f["height"] for f in segmented["base"][0]]))
    build_surtur_sheet(
        src_dir=Path("docs/arte/fury-pintada"),
        out_dir=out_dir,
        base_cell_char_h=base_idle_raw_h * global_scale,
        base_render_scale=render_scale,
        canvas_size=canvas_size,
        tolerance=tolerance,
        padding=padding,
    )


def quantize_to_detailed_pixel_art(image: Image.Image, colors: int = 64) -> Image.Image:
    """
    Converte a arte pintada já reduzida em pixel art nítida e detalhada:
    - Binariza o canal alfa para eliminar bordas borradas (anti-aliasing)
    - Quantiza a paleta para `colors` tons ricos sem dither para dar textura autêntica de pixel art.
    """
    rgba = np.array(image.convert("RGBA"), dtype=np.uint8)
    alpha = rgba[:, :, 3]
    # Borda firme de pixel art
    hard_alpha = np.where(alpha >= 110, 255, 0).astype(np.uint8)
    rgb = Image.fromarray(rgba[:, :, :3], mode="RGB")
    quant_rgb = rgb.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    out_arr = np.dstack([np.array(quant_rgb, dtype=np.uint8), hard_alpha])
    return Image.fromarray(out_arr, mode="RGBA")


def build_surtur_sheet(
    src_dir: Path,
    out_dir: Path,
    base_cell_char_h: float,
    base_render_scale: float,
    canvas_size: int = 128,
    tolerance: float = 38.0,
    padding: int = 4,
):
    """
    Processa as novas sprites do Modo Surtur (Fúria) em docs/arte/fury-pintada/
    usando detecção de componentes conectados, escala única global para todas as animações,
    proporção idêntica ao Viking Base e geração de debug_boxes_surtur.png.
    """
    anim_files = {
        "idle": src_dir / "idle.png",
        "run": src_dir / "run.png",
        "jump": src_dir / "jump.png",
        "attack": src_dir / "attack.png",
        "attackOverhead": src_dir / "overhead.png",
        "attackSpin": src_dir / "spin.png",
        "attackPlunge": src_dir / "plunge.png",
        "throw": src_dir / "throw.png",
    }
    if not all(p.exists() for p in anim_files.values()):
        print("  [AVISO] Arquivos do Modo Surtur não encontrados por completo; pulando.")
        return

    print("\n=== SEGMENTANDO MODO SURTUR (FÚRIA) POR COMPONENTES CONECTADOS ===")
    segmented_surtur: dict[str, list[dict]] = {}
    debug_strips: list[Image.Image] = []

    for anim_name, path in anim_files.items():
        im = Image.open(path).convert("RGBA")
        rows_frames, dbg_img, _ = segment_sheet_connected_components(
            im,
            tolerance=tolerance,
            min_island_area=15,
            padding=padding,
            expected_rows=1,
            expected_cols=6,
        )
        frames = rows_frames[0] if rows_frames else []
        segmented_surtur[anim_name] = frames
        debug_strips.append(dbg_img)
        print(f"  [surtur/{anim_name}] {path.name}: {len(frames)} frames detectados")

    all_surtur_frames = [f for fs in segmented_surtur.values() for f in fs]
    max_w = max(f["width"] for f in all_surtur_frames)
    max_h = max(f["height"] for f in all_surtur_frames)

    # Calcula a altura real do corpo (sem as chamas acima do capacete) no idle para usar
    # EXATAMENTE a mesma densidade de pixel art e renderScale do Viking Base!
    idle_body_heights = []
    for f in segmented_surtur["idle"]:
        arr = np.array(f["image"])
        fr, fg_c, fb, fa = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3] > 0
        # Corpo/elmo/barba (excluindo chamas puras laranja/vermelho brilhante acima do elmo)
        body_m = fa & ((fr < 175) | (fb > 55))
        if np.any(body_m):
            ys, _ = np.where(body_m)
            idle_body_heights.append(float(ys.max() - ys.min() + 1))
    surtur_idle_body_h = float(np.median(idle_body_heights)) if idle_body_heights else 140.0

    # Escala única global travada pela densidade de pixel art do Base (~0.24x)
    usable_span = canvas_size - 8
    max_fit_scale = min(usable_span / float(max_w), usable_span / float(max_h))
    pixel_matched_scale = base_cell_char_h / surtur_idle_body_h
    surtur_scale = min(max_fit_scale, pixel_matched_scale)
    foot_anchor_y = canvas_size - max(12, int(round(canvas_size * 0.11)))
    surtur_render_scale = round((base_cell_char_h * base_render_scale) / (surtur_idle_body_h * surtur_scale), 4)

    print(
        f"  Maior frame Surtur: {max_w}x{max_h}px -> Escala Única Pixel-Art = {surtur_scale:.4f} | "
        f"renderScale = {surtur_render_scale:.4f} (mesma densidade de pixel e proporção 1:1 com Base)"
    )

    # Salva debug_boxes_surtur.png
    max_dw = max(im.width for im in debug_strips)
    total_dh = sum(im.height for im in debug_strips)
    surtur_dbg = Image.new("RGBA", (max_dw, total_dh), (18, 22, 34, 255))
    cur_y = 0
    for im in debug_strips:
        surtur_dbg.paste(im, (0, cur_y))
        cur_y += im.height
    surtur_dbg.save(out_dir / "debug_boxes_surtur.png", format="PNG")
    surtur_dbg.save(Path("debug_boxes_surtur.png"), format="PNG")

    def render_surtur_row(frames_list: list[dict], is_airborne: bool = False) -> list[Image.Image]:
        foot_ys = [f["global_foot_y"] for f in frames_list]
        row_foot_y = float(np.percentile(foot_ys, 85)) if is_airborne else float(np.median(foot_ys))
        out_imgs = []
        for f in frames_list:
            c_img = render_frame_on_uniform_canvas(
                f,
                global_scale=surtur_scale,
                canvas_size=canvas_size,
                foot_anchor_y=foot_anchor_y,
                row_foot_y=row_foot_y,
                is_airborne=is_airborne,
            )
            c_img = enhance_sprite_colors(c_img, is_thunder=False)
            c_img = quantize_to_detailed_pixel_art(c_img, colors=64)
            out_imgs.append(c_img)
        while len(out_imgs) < 6:
            out_imgs.append(out_imgs[-1].copy())
        return out_imgs[:6]

    s_idle = render_surtur_row(segmented_surtur["idle"])
    s_run = render_surtur_row(segmented_surtur["run"])
    s_jump = render_surtur_row(segmented_surtur["jump"], is_airborne=True)
    s_attack = render_surtur_row(segmented_surtur["attack"])
    s_overhead = render_surtur_row(segmented_surtur["attackOverhead"])
    s_spin = render_surtur_row(segmented_surtur["attackSpin"])
    s_plunge = render_surtur_row(segmented_surtur["attackPlunge"], is_airborne=True)
    s_throw = render_surtur_row(segmented_surtur["throw"])

    # Machado flamejante giratório (extraído do frame 3 de throw ou axe-raw)
    axe_canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    v_art_path = Path("public/assets/viking-art.png")
    if v_art_path.exists():
        v_art = Image.open(v_art_path).convert("RGBA")
        axe_crop = v_art.crop((0, 12 * 224, 224, 13 * 224))
        axe_canvas = enhance_sprite_colors(
            axe_crop.resize((canvas_size, canvas_size), resample=Image.Resampling.NEAREST)
        )

    surtur_rows = {
        "idle": s_idle,
        "walk": s_run,
        "run": s_run,
        "jump": s_jump,
        "attack": s_attack,
        "attackCombo": [s_attack[0], s_attack[2], s_overhead[2], s_overhead[3], s_attack[4], s_attack[5]],
        "attackSpin": s_spin,
        "attackOverhead": s_overhead,
        "attackPlunge": s_plunge,
        "throw": s_throw,
        "hurt": [s_jump[0], s_jump[4]],
        "fall": [s_jump[4], s_jump[5], s_plunge[4], s_plunge[5]],
        "axe": [axe_canvas],
    }

    surtur_order = [
        "idle", "walk", "run", "jump", "attack", "attackCombo",
        "attackSpin", "attackOverhead", "attackPlunge", "throw", "hurt", "fall", "axe"
    ]
    surtur_sheet = Image.new("RGBA", (canvas_size * 6, canvas_size * len(surtur_order)), (0, 0, 0, 0))
    for r_idx, name in enumerate(surtur_order):
        frames = surtur_rows[name]
        for c_idx, frm in enumerate(frames):
            surtur_sheet.paste(frm, (c_idx * canvas_size, r_idx * canvas_size))
            if name != "axe":
                frm.save(out_dir / f"viking_surtur_{name}_{c_idx}.png", format="PNG")
    surtur_sheet.save(out_dir / "viking_fury_96.png", format="PNG")

    axe_pivot = {"x": int(round(45 * canvas_size / 96.0)), "y": int(round(47 * canvas_size / 96.0))}
    surtur_meta = {
        "cell": canvas_size,
        "footY": foot_anchor_y,
        "renderScale": surtur_render_scale,
        "globalScale": round(surtur_scale, 4),
        "cols": 6,
        "rows": len(surtur_order),
        "anims": {
            "idle": {"row": 0, "frames": 6, "loop": True, "fps": 8},
            "walk": {"row": 1, "frames": 6, "loop": True, "stride": 64, "steps": [0, 0.5]},
            "run": {"row": 2, "frames": 6, "loop": True, "stride": 88, "steps": [0, 0.5]},
            "jump": {"row": 3, "frames": 6, "loop": False},
            "attack": {"row": 4, "frames": 6, "loop": False, "durations": [0.05, 0.08, 0.06, 0.09, 0.08, 0.09], "hitFrame": 2},
            "attackCombo": {"row": 5, "frames": 6, "loop": False, "durations": [0.06, 0.08, 0.07, 0.08, 0.08, 0.1], "hitFrames": [1, 3], "hitFrame": 1},
            "attackSpin": {"row": 6, "frames": 6, "loop": False, "durations": [0.05, 0.05, 0.05, 0.06, 0.06, 0.07], "hitFrames": [1, 2, 3, 4], "hitFrame": 2},
            "attackOverhead": {"row": 7, "frames": 6, "loop": False, "durations": [0.06, 0.08, 0.07, 0.08, 0.08, 0.1], "hitFrame": 2},
            "attackPlunge": {"row": 8, "frames": 6, "loop": False, "durations": [0.06, 0.06, 0.08, 0.1, 0.08, 0.09], "hitFrame": 3},
            "throw": {"row": 9, "frames": 6, "loop": False, "durations": [0.06, 0.08, 0.05, 0.07, 0.08, 0.1], "hitFrame": 2},
            "hurt": {"row": 10, "frames": 2, "loop": False, "durations": [0.12, 0.18]},
            "fall": {"row": 11, "frames": 4, "loop": False, "durations": [0.12, 0.08, 0.08, 0.2]},
            "axe": {"row": 12, "frames": 1, "pivot": axe_pivot},
        },
    }
    with open(out_dir / "viking_fury_96.json", "w", encoding="utf-8") as f:
        json.dump(surtur_meta, f, indent=2)

    print(f"  [OK] Folha Modo Surtur salva em: {out_dir / 'viking_fury_96.png'} e debug_boxes_surtur.png")


def process_input_directory_or_file(
    input_path: Path,
    out_dir: Path,
    canvas_size: int = 128,
    tolerance: float = 38.0,
    padding: int = 4,
):
    """
    Processa qualquer arquivo ou pasta de sprites brutos (ex: docs/arte/fury-pintada)
    usando detecção de componentes conectados, escala única por folha e debug_boxes.png.
    """
    if input_path.is_file():
        files = [input_path]
    else:
        files = sorted(
            p for p in input_path.iterdir()
            if p.is_file() and p.suffix.lower() in VALID_EXTENSIONS
        )

    out_dir.mkdir(parents=True, exist_ok=True)
    debug_strips = []

    for fpath in files:
        im = Image.open(fpath).convert("RGBA")
        w, h = im.size
        expected_cols = 6 if w >= h * 2.5 else 1
        expected_rows = 5 if h >= 550 and w >= 800 else 1

        rows_frames, dbg_img, _ = segment_sheet_connected_components(
            im,
            tolerance=tolerance,
            min_island_area=15,
            padding=padding,
            expected_rows=expected_rows,
            expected_cols=expected_cols,
        )
        all_f = [f for r in rows_frames for f in r]
        if not all_f:
            continue

        max_w = max(f["width"] for f in all_f)
        max_h = max(f["height"] for f in all_f)
        global_scale = min((canvas_size - 8) / float(max_w), (canvas_size - 8) / float(max_h))
        foot_anchor_y = canvas_size - max(12, int(round(canvas_size * 0.11)))

        for r_idx, r_frames in enumerate(rows_frames):
            row_foot_y = float(np.median([f["global_foot_y"] for f in r_frames]))
            for c_idx, finfo in enumerate(r_frames):
                rendered = render_frame_on_uniform_canvas(
                    finfo,
                    global_scale=global_scale,
                    canvas_size=canvas_size,
                    foot_anchor_y=foot_anchor_y,
                    row_foot_y=row_foot_y,
                    is_airborne=("jump" in fpath.stem.lower()),
                )
                rendered = enhance_sprite_colors(rendered)
                if len(rows_frames) > 1:
                    out_name = f"{fpath.stem}_{r_idx}_{c_idx}.png"
                elif len(r_frames) > 1:
                    out_name = f"{fpath.stem}_{c_idx}.png"
                else:
                    out_name = f"{fpath.stem}.png"
                rendered.save(out_dir / out_name, format="PNG")

        dbg_img.save(out_dir / f"debug_boxes_{fpath.stem}.png", format="PNG")
        debug_strips.append(dbg_img)
        print(f"  [OK] {fpath.name}: {len(all_f)} frame(s) extraído(s) (max={max_w}x{max_h}px, scale={global_scale:.3f})")

    if debug_strips:
        max_dw = max(im.width for im in debug_strips)
        total_dh = sum(im.height for im in debug_strips)
        master_dbg = Image.new("RGBA", (max_dw, total_dh), (18, 22, 34, 255))
        cur_y = 0
        for im in debug_strips:
            master_dbg.paste(im, (0, cur_y))
            cur_y += im.height
        master_dbg.save(out_dir / "debug_boxes.png", format="PNG")


def main():
    parser = argparse.ArgumentParser(
        description="Processa sprites por detecção de componentes conectados (ilhas de pixels), sem corte por grade fixa."
    )
    parser.add_argument("--input", "-i", type=str, default="docs/arte/fury-pintada", help="Pasta ou arquivo de entrada")
    parser.add_argument("--output", "-o", type=str, default="assets/sprites_ready", help="Pasta de saída")
    parser.add_argument("--base-dir", type=str, default="public/assets/base_ready", help="Pasta de saída das folhas Base e Modo Thor")
    parser.add_argument("--tolerance", "-t", type=float, default=38.0, help="Tolerância de cor para remoção de fundo")
    parser.add_argument("--padding", "-p", type=int, default=4, help="Margem de segurança (padding) em pixels na bounding box")
    parser.add_argument("--size", "-s", type=int, default=128, help="Tamanho do canvas uniforme (padrão: 128)")
    parser.add_argument("--only-input", action="store_true", help="Processa apenas o caminho --input sem reconstruir base_ready")

    args = parser.parse_args()

    if not args.only_input:
        build_viking_sheets_from_raw(
            out_dir=Path(args.base_dir),
            canvas_size=args.size,
            tolerance=args.tolerance,
            padding=args.padding,
        )

    input_path = Path(args.input)
    if input_path.exists():
        print(f"\n=== PROCESSANDO SPRITES DE {input_path} ===")
        process_input_directory_or_file(
            input_path=input_path,
            out_dir=Path(args.output),
            canvas_size=args.size,
            tolerance=args.tolerance,
            padding=args.padding,
        )

    print("\nProcessamento por componentes conectados concluído com sucesso!")


if __name__ == "__main__":
    main()
