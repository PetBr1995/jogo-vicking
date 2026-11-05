# Especificação da arte pintada (sprites)

Este documento diz exatamente como entregar a arte do **viking** (jogador) e do
**saxão** (inimigo) para o jogo usar direto, sem recorte. Serve para um artista de
pixel art ou para gerar com uma ferramenta de IA.

As guias de desenho estão nesta pasta:

- `guia-viking.png` — modelo da folha do viking
- `guia-saxon.png` — modelo da folha do saxão

Cada guia já é a folha final em tamanho real: pinte por cima (numa camada separada)
e entregue só a arte, sem as linhas da guia.

## Regras da folha (as mais importantes)

1. **Formato:** PNG com **fundo transparente** (nada de fundo xadrez "pintado",
   nada de branco).
2. **Grade fixa:** cada quadro ocupa um quadrado de **128 × 128 pixels**. Os quadros
   ficam lado a lado, sem espaço entre eles, começando no canto superior esquerdo.
3. **Uma linha por movimento**, na ordem da tabela abaixo. Os quadros sobrando
   numa linha ficam vazios (transparentes).
4. **Pés no chão:** a sola dos pés fica sempre na **linha magenta** da guia
   (y = 120 dentro de cada quadro), menos quando o personagem está no ar.
5. **Ponto de apoio:** a cruz **ciano** (x = 62, y = 120) é o ponto entre os pés.
   O personagem deve ficar centrado nele em todos os quadros, sem "escorregar"
   de um quadro para outro.
6. **Virado para a direita** em todos os quadros (o jogo espelha para a esquerda).
7. **Tamanho:** o personagem tem cerca de **90 a 100 px de altura**, como a forma
   cinza da guia. Nada pode sair do quadrado de 128 px (machado e lança inclusive).
8. **Sem sombra no chão e sem cenário:** o jogo desenha a sombra e o fundo.
9. **Mesma paleta e mesma luz** em todos os quadros (luz vindo de cima à esquerda).
10. **Pixel art de verdade:** sem antisserrilhado contra o fundo (bordas com
    pixels inteiros, nada de borda semitransparente borrada).

## Movimentos

As formas cinza na guia são as poses que já foram aprovadas no jogo: siga a
**posição das pernas, dos braços e do corpo** de cada quadro. O visual (roupa,
músculos, sombreado) é livre, dentro da descrição dos personagens abaixo.

### Viking — `viking-art.png` (12 quadros de largura × 13 linhas = 1536 × 1664 px)

| Linha | Movimento | Quadros | Observação |
|---|---|---|---|
| 1 | Parado | 4 | Respirando: o peito sobe e desce de leve. |
| 2 | Andar | 12 | Ciclo completo (dois passos). O último quadro emenda no primeiro. |
| 3 | Correr | 12 | Corpo inclinado para frente; nos quadros 4 e 10 os dois pés estão no ar. |
| 4 | Pular | 6 | 1 agacha · 2 impulso · 3 subindo (joelhos encolhidos) · 4 topo · 5 caindo · 6 aterrissa. Desenhe com os pés na linha do chão: a altura do pulo é feita pelo jogo. |
| 5 | Atacar | 7 | Golpe de machado por cima. **Quadro 5 (borda vermelha) é o impacto.** Os quadros 4 e 5 podem ter o rastro do corte. |
| 6 | Levou golpe | 2 | Novo: tranco para trás com cara de dor. Sem forma de referência. |
| 7 | Queda | 4 | Novo: derrotado, cai de costas. 1 recua · 2 inclina · 3 despenca · 4 deitado no chão. A forma cinza é só uma ideia de movimento. |
| 8 | Arremesso | 6 | Na fúria ele arremessa o machado. 1–2 leva o machado atrás da cabeça · 3 braço vem para frente · **4 solta o machado (borda vermelha)** · 5–6 mão vazia. |
| 9 | Parado sem machado | 4 | Igual ao parado, mas de mãos vazias (enquanto o machado voa). |
| 10 | Andar sem machado | 12 | Igual ao andar, mãos vazias. |
| 11 | Correr sem machado | 12 | Igual ao correr, mãos vazias. |
| 12 | Pular sem machado | 6 | Igual ao pular, mãos vazias. |
| 13 | Machado | 1 | Só o machado, sem o viking, cabo na vertical e lâmina para a direita. A cruz ciano é o ponto em volta do qual ele gira no ar: deixe-a no meio do machado. |

### Saxão — `saxon-art.png` (12 quadros de largura × 5 linhas = 1536 × 640 px)

| Linha | Movimento | Quadros | Observação |
|---|---|---|---|
| 1 | Parado | 4 | Em guarda, escudo na frente, lança apontada. |
| 2 | Andar | 12 | Ciclo completo, mesmo ritmo do viking. |
| 3 | Estocada | 6 | 1 guarda · 2–3 puxa a lança para trás (é o aviso para o jogador) · 4 estoca com um passo · **5 braço todo esticado (impacto, borda vermelha)** · 6 volta. |
| 4 | Levou golpe | 2 | Novo: tranco para trás. |
| 5 | Queda | 4 | Cai de costas: recua · inclina · despenca · deitado. |

## Os personagens

**Viking (jogador):** guerreiro nórdico baixo e muito forte, de perfil virado para
a direita. Capacete redondo de ferro com protetor de nariz (sem chifres), barba
ruiva longa com trança, sobrancelha brava. Braços nus e musculosos com braçadeiras
de couro. Cota de malha até a coxa, cinto largo com fivela, pelo claro sobre os
ombros. Escudo redondo nas costas (metade vermelha, metade creme, aro e umbo de
ferro). Machado grande de lâmina "barbada" na mão da frente. Calça escura, faixas
de couro cruzadas na canela, botas marrons.

**Saxão (inimigo):** soldado mais comum que o viking. Elmo cônico com protetor de
nariz, barba castanha curta. Túnica de lã azul até o joelho com barra amarela,
cinto de couro. Calça marrom com tiras cruzadas, botas escuras. Escudo redondo na
frente do corpo, pintado em quartos verde e creme. Lança longa com ponta de ferro.

**Estilo desejado:** pixel art detalhada de jogo de luta/ação de arcade dos anos 90:
contorno escuro, músculos e volumes bem sombreados, cores fortes. (Use como
referência de estilo, não copie personagens de outros jogos.)

## Entrega

- `viking-art.png` (1536 × 1664) e `saxon-art.png` (1536 × 640).
- Se possível, mande também o arquivo de trabalho com camadas (Aseprite, PSD).

## Como colocar no jogo

1. Copie `viking-art.png` e/ou `saxon-art.png` para `public/assets/`.
2. Recarregue o jogo. Ele usa a arte nova sozinho (descrita em
   `public/assets/viking-art.json` e `saxon-art.json`); se um arquivo não existir,
   continua com o boneco gerado por código.

As guias e os `*-art.json` são gerados por `node tools/make-guides.mjs` a partir das
poses atuais. Se uma pose mudar, rode de novo e mande a guia nova ao artista.

---

## Short brief in English (for artists)

Two characters, side view facing right, detailed 90s-arcade-style pixel art (dark
outline, strong muscle shading). Deliver **transparent PNG sprite sheets on a fixed
grid of 128 × 128 px frames**, no gaps, one row per animation, frames left to right.
Feet always on the magenta line (y = 120), character centered on the cyan cross
(x = 62, y = 120), about 90–100 px tall, nothing outside the frame, no ground shadow,
no background, no anti-aliasing against the background.

Paint over the attached guides (`guia-viking.png`, `guia-saxon.png`): the gray
shapes are the approved poses — keep the pose of every frame; the look is yours.

- **Viking** (`viking-art.png`, 1536 × 1664): idle 4, walk 12 (loop), run 12 (loop),
  jump 6, axe attack 7 (frame 5 = impact), hurt 2, fall/defeat 4, axe throw 6 (frame 4 =
  the axe leaves his hand), then idle 4 / walk 12 / run 12 / jump 6 again **empty-handed**
  (while the axe flies), and one frame with **only the axe** (handle vertical, blade
  right, centered on the cyan cross it spins around). Short, very
  strong Norse warrior: round iron helmet with nose guard (no horns), long red
  braided beard, bare muscular arms with leather bracers, chainmail, fur over the
  shoulders, round red/cream shield on his back, big bearded axe.
- **Saxon** (`saxon-art.png`, 1536 × 640): idle 4, walk 12 (loop), spear thrust 6
  (frames 2–3 = wind-up warning, frame 5 = impact), hurt 2, fall 4. Conical helmet
  with nose guard, short brown beard, knee-length blue wool tunic with yellow hem,
  round green/cream quartered shield held in front, long spear.
