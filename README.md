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

## Cenário

Um mundo de 4.000 px (`WORLD_WIDTH` em `src/scene.js`) num entardecer nórdico. A câmera
segue o viking com suavidade, olhando um pouco para o lado em que ele está virado, e para
nas pontas do mundo. O fundo tem camadas que se movem em velocidades diferentes (céu com
lua e estrelas, montanhas nevadas, colinas com floresta, pinheiros mais perto), e o chão
tem uma trilha de terra, grama e pedras presas ao mundo. Tudo em pixel art do mesmo
tamanho de pixel dos bonecos. Cores em `C` e velocidades das camadas em `buildLayers`
(`src/scene.js`); ajuste da câmera em `CAMERA` (`src/main.js`).

## Inimigo

O **guerreiro saxão** (`tools/make-enemy.mjs` → `public/assets/saxon.png`) usa o mesmo
corpo e o mesmo andar do viking. Ele patrulha; quando o viking chega perto, vem até ele e
para a distância de lança. O machado tira 1 de 5 de vida: ele pisca branco, é empurrado e
mostra a barra de vida. Derrotado, cai, pisca e some, e outro entra logo fora da tela, à frente do viking.

Ele também ataca: puxa a lança para trás, segura um instante (o aviso) e estoca. Acertá-lo
durante o aviso cancela o golpe. Para desviar, pule ou saia da linha dele. O viking tem 8 de
vida (barra no topo da tela): ao ser atingido, pisca branco, é empurrado e fica 1 s
invencível piscando. Sem vida, aparece "O viking caiu" e Enter recomeça. Ajustes em `LIFE`
(`src/player.js`).
Distâncias e velocidades em `AI` e `HURT` (`src/enemy.js`); alcance do machado em
`AXE_REACH` (`src/main.js`).

## Arte pintada (em andamento)

O visual final vai ser pintado (artista ou IA) numa grade fixa, sem recorte. A
especificação e as guias de desenho estão em `docs/arte/` (`ESPECIFICACAO.md`,
`guia-viking.png`, `guia-saxon.png`). Quando `public/assets/viking-art.png` ou
`saxon-art.png` existirem, o jogo usa a arte nova sozinho (com os movimentos novos
"levou golpe" e queda); senão, usa os bonecos gerados por código. Guias e
`*-art.json`: `node tools/make-guides.mjs`.

## Estrutura

- `tools/pixel-art.mjs` — partes comuns de desenho: formas, contorno, pernas, ciclo do andar, gravar a sprite sheet
- `tools/make-viking.mjs` — desenha o viking e as poses dele
- `tools/make-enemy.mjs` — desenha o saxão
- `tools/make-guides.mjs` — guias de desenho e descrição da arte pintada
- `src/player.js` — movimento (aceleração, frenagem), corrida, pulo, ataque e vida do viking
- `src/enemy.js` — patrulha, perseguição, estocada, golpe recebido e vida do saxão
- `src/white.js` — cópia branca da sprite sheet, para o piscar do golpe
- `src/scene.js` — o cenário: céu, montanhas, florestas e chão, com rolagem em camadas
- `src/main.js` — loop do jogo, câmera, poeira, tremor de tela, acertos, barra de vida e derrota
