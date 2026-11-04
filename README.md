# Jogo Viking

Protótipo do personagem viking em pixel art, de perfil (Canvas 2D + Vite).
Recomeçado do zero, passo a passo: por enquanto **parado**, **andar**, **correr**, **pular** e **atacar**.

## Rodar

```bash
npm install
npm run dev
```

Abra http://localhost:5173

## Controles

| Tecla | Ação |
|---|---|
| ← → / A D | andar |
| ↑ ↓ / W S | mover em profundidade |
| Shift | correr |
| Espaço / K | pular |
| J | atacar |
| B | mostrar a caixa do quadro e o ponto de apoio |

## Sprites

O viking é desenhado por código em `tools/make-viking.mjs`, em uma grade fixa
(cada quadro é uma célula de 64×64, pés sempre na mesma linha), então o jogo não
precisa recortar nada. Depois de mudar o desenho ou as poses, gere de novo:

```bash
node tools/make-viking.mjs
```

Saída: `public/assets/viking.png` (linha 0 = parado, 4 quadros; linha 1 = andar,
12 quadros; linha 2 = correr, 12 quadros; linha 3 = pular, 6 quadros; linha 4 = atacar, 7 quadros) e `public/assets/viking.json` (tamanho da célula, ponto de apoio e
o passo do andar).

As poses do andar ficam em `LEG` (ângulos de coxa e joelho em 8 poses-chave);
os quadros intermediários são interpolados, então dá para aumentar
`WALK_FRAMES` para deixar mais suave. A corrida usa o mesmo esquema com
`RUN_LEG` (e `RUN_AIR` para o momento com os dois pés no ar). O pulo tem uma
pose por momento em `jump`; a altura vem do jogo (`JUMP` em `src/player.js`). O ataque fica em `attack`
(tempo de cada quadro em `durations`, o impacto em `hitFrame`).

## Estrutura

- `tools/make-viking.mjs` — desenha o personagem e gera a sprite sheet
- `src/player.js` — movimento (aceleração, frenagem) e animação: as pernas avançam
  conforme a distância andada, e ao parar ele termina o passo antes de ficar parado
- `src/main.js` — loop do jogo, cenário e poeira dos passos
