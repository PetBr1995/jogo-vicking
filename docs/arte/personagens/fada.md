# Fada

Vilã que **voa**. Rápida, difícil de acertar de perto, frágil, joga faíscas douradas.

- Folha-modelo: `docs/arte/personagens/fada/modelo.png` (original `.webp` na mesma pasta)
- Folha do jogo: `public/assets/fada-art.png` + `fada-art.json`, gerada por `node tools/make-enemy-sheet.mjs fada`
- Estado: **arte provisória** (vinda do modelo; dano e queda improvisados por código)
- Prompts gerais dos vilões: [../PROMPTS-VILOES.md](../PROMPTS-VILOES.md)

## Visual

Fada pequena de cabelo **loiro dourado curto**, asas translúcidas de libélula (azul-claro), vestido
de pétalas rosa-antigo, capa curta rosada, botas escuras e um **cajado** de madeira com uma gema
brilhante. Brilhos e pó mágico ao redor. Olhos escuros grandes (azul-claros brilhando ao lançar o feitiço).

## Comportamento no jogo (já implementado)

| | |
|---|---|
| Vida | 2 golpes (a mais frágil) |
| Voo | flutua ≈38 px acima do chão, balançando; cai ao ser derrotada |
| Distância | para a ≈230 px do viking e atira dali |
| Ataque | no 3º quadro sai uma **faísca dourada** rápida (reta) |
| Dano ao viking | 1 de vida; a faísca pode ser desviada pulando |
| Tempo entre disparos | 1,1 a 1,9 s |
| Velocidade | patrulha 110, perseguição 175 (a mais rápida) |

## Linhas de sprite

| Linha | Movimento | Estado |
|---|---|---|
| 1 | Parado (voando no lugar) | ✅ do modelo |
| 2 | Andar (voo calmo, com rastro) | ✅ do modelo |
| 3 | Correr (voo rápido) | ✅ do modelo |
| 4 | Ataque (quadro do disparo: o 3º) | ✅ do modelo |
| 5 | Levar dano (2) | ⚠️ improvisado por código |
| 6 | Cair (5) | ⚠️ improvisado por código |
| , | Faísca (projétil) | ⚠️ desenhado por código, pode virar sprite |

## Prompts

Use o **PROMPT BASE** de [PROMPTS-VILOES.md](../PROMPTS-VILOES.md) com este `[PERSONAGEM]`:
```
uma FADA pequena voando: cabelo loiro dourado curto, asas translúcidas de
libélula azul-claro, vestido de pétalas rosa-antigo, capa curta rosada, botas
escuras, cajado de madeira com uma gema brilhando, pó mágico brilhando ao redor
```

Para Parado, Andar e Correr, acrescente: "ela **voa**, os pés nunca tocam o chão; as asas batem
(posições diferentes a cada quadro)". Os blocos de Levar dano e Cair estão em PROMPTS-VILOES.md.
Para o Cair: "as asas se dobram e ela despenca".

**Ataque da fada**
```
ATAQUE MÁGICO EM VOO, 6 quadros: 1) pairar com o cajado de lado, 2) apontar o
cajado à frente, olhos azul-claros acendendo, espiral de luz se formando,
3) LANÇAR: o braço à frente, uma onda de energia branca-azulada e faíscas
douradas saem da ponta do cajado, 4) a nuvem de faíscas douradas se afasta,
5) recolher o cajado, 6) voltar a pairar. O feitiço cabe DENTRO do quadro.
```

**Faísca (projétil), efeito sem personagem**
```
Gere uma linha de sprite sheet de um EFEITO, sem personagem: uma FAÍSCA de
pó mágico dourado, pequena e brilhante, com rastro de partículas douradas
para trás (voando para a direita), em pintura 2D com contorno escuro fino, no
estilo da fada anexa. 6 quadros em loop, a faísca cintilando, fundo
transparente, nada cruza a divisa, ocupa no máximo 50% do quadro.
```

## Para colocar no jogo depois de gerar

1. Salve as imagens em `docs/arte/personagens/fada/` e me avise.
2. Eu atualizo `tools/make-enemy-sheet.mjs` para ler as linhas novas e rodo o comando acima.
