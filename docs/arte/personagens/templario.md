# Templário

Vilão pesado. Muita vida, anda devagar, bate forte e quase não recua quando é atingido.

- Folha-modelo: `docs/arte/personagens/templario/modelo.png` (original `.webp` na mesma pasta)
- Folha do jogo: `public/assets/templario-art.png` + `templario-art.json`, gerada por `node tools/make-enemy-sheet.mjs templario`
- Estado: **arte provisória** (vinda do modelo; dano e queda improvisados por código)
- Prompts gerais dos vilões: [../PROMPTS-VILOES.md](../PROMPTS-VILOES.md)

## Visual

Cavaleiro templário em armadura: **elmo de balde cinza** com viseira em cruz vermelha, **penacho vermelho**
no topo, peitoral branco com **cruz vermelha**, ombreira e manoplas de aço, capa escura rasgada, **espada
longa** de aço e **escudo** escuro redondo. Golpes com arcos brancos de corte.

## Comportamento no jogo (já implementado)

| | |
|---|---|
| Vida | 9 golpes (o saxão tem 5) |
| Distância | luta de perto, para a ≈96 px do viking |
| Ataque | golpe de espada no 4º quadro; alcance de 138 px |
| Dano ao viking | **2 de vida** por golpe |
| Recuo ao ser atingido | só 35% do normal (pesado) |
| Tempo entre golpes | 1,2 a 2,0 s |
| Velocidade | patrulha 48, perseguição 80 (o mais lento) |

## Linhas de sprite

| Linha | Movimento | Estado |
|---|---|---|
| 1 | Parado | ✅ do modelo |
| 2 | Andar | ✅ do modelo |
| 3 | Correr | ✅ do modelo |
| 4 | Ataque (quadro do golpe: o 4º) | ✅ do modelo |
| 5 | Levar dano (2) | ⚠️ improvisado por código |
| 6 | Cair (5) | ⚠️ improvisado por código |

## Prompts

Use o **PROMPT BASE** de [PROMPTS-VILOES.md](../PROMPTS-VILOES.md) com este `[PERSONAGEM]`:
```
um CAVALEIRO TEMPLÁRIO em armadura: elmo de balde cinza com viseira em cruz
vermelha e penacho vermelho, peitoral branco com cruz vermelha, ombreira e
manoplas de aço, capa escura rasgada, espada longa de aço e escudo escuro
```

Os blocos de Parado, Andar, Correr, Levar dano e Cair estão em PROMPTS-VILOES.md. Para o Cair,
acrescente: "a armadura faz o corpo bater pesado no chão; o escudo cai ao lado".

**Ataque do templário**
```
ATAQUE COM ESPADA, 6 quadros: 1) escudo à frente, espada baixa, postura firme,
2) levantar a espada acima e atrás da cabeça, arco branco de corte começando,
3) segurar um instante (o aviso do golpe), 4) GOLPE pesado para a frente e para
baixo com um arco branco largo de corte, 5) a espada passa e o corpo acompanha,
6) recuperar a postura com o escudo à frente. O arco de corte cabe DENTRO do quadro.
```

## Para colocar no jogo depois de gerar

1. Salve as imagens em `docs/arte/personagens/templario/` e me avise.
2. Eu atualizo `tools/make-enemy-sheet.mjs` para ler as linhas novas e rodo o comando acima.
