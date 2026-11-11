# Prompts de sprites

Cole o **PROMPT BASE**, troque o `[MODO]` e o `[MOVIMENTO]` pelos blocos abaixo.
Anexe sempre: a folha do modo (`docs/arte/modos/`) e a corrida de referência.

**Se for refazer tudo, comece pelo BASE.** Gere a corrida do Base primeiro e use ela como a
"imagem de corrida" de referência de todos os outros modos. Assim o corpo fica igual em todos.
Para o Base, anexe `docs/arte/guia-viking.png` e `docs/arte/sheet-base.png` (ainda não há uma corrida nova).

---

## PROMPT BASE

```
Gere uma SPRITE SHEET em pixel art / pintura 2D de um viking barbudo ruivo
em visão lateral (de perfil, virado para a direita), no MODO [MODO].

REFERÊNCIAS ANEXAS: copie exatamente o corpo, o capacete, a barba, a capa, o
machado, as proporções, o contorno escuro grosso e o estilo de pintura do
viking da imagem de corrida. A outra imagem é a folha do modo: quero a MESMA
qualidade e a MESMA pegada dela.

ESTILO DO MODO:
[ESTILO]

FORMATO DA GRADE:
- 6 quadros por linha, lado a lado, sem espaço entre eles.
- Fundo TRANSPARENTE (PNG com alpha), sem sombra no chão.
- Os PÉS do viking sempre no mesmo ponto em todos os quadros.
- Nada pode passar das bordas do quadro nem invadir o vizinho, incluindo
  fogo, raio, arco do machado e poeira. Deixe folga nas laterais.
- Mesmo ângulo de câmera, mesma escala e mesma iluminação em todos os quadros.
- O corpo NÃO muda de tamanho nem de forma: igual ao da imagem de corrida.

LINHA PEDIDA: [MOVIMENTO]

Entregue UMA imagem por linha, 6 quadros.
```

---

## [ESTILO] de cada modo

**BASE** (sem poder)
```
- O viking comum, sem nenhum efeito de poder: sem fogo, sem raio, sem brilho.
- Cores naturais: barba e cabelo ruivos, capacete de ferro cinza, capa
  marrom-escura, botas e roupa escuras, machado de ferro.
- Olhos normais (pretos, sem brilho).
- Golpes do machado com rastro BRANCO simples (arco de corte), sem fogo.
- Nos movimentos pedidos abaixo, onde diz "efeito do modo", leia: nenhum
  efeito de poder, só o movimento do corpo, o arco branco do machado e
  poeira nos pés quando aterrissa.
```

**FÚRIA**
```
- Chamas vermelhas e laranja ao redor do corpo, do machado e da capa,
  pintadas no mesmo estilo do viking (não um efeito colado por cima).
- Cores do fogo: vermelho-escuro na borda, vermelho, laranja, miolo amarelo-claro.
- Olhos vermelhos brilhantes.
- Golpes do machado com rastro de fogo vermelho.
```

**FOGO**
```
- Fogo vivo ao redor do corpo, do machado e da barba; a barba arde em chamas;
  pontas da capa queimando.
- Cores: laranja, amarelo, vermelho-claro, brasas amarelas.
- Olhos amarelos incandescentes.
- Golpes do machado com rastro de fogo laranja e amarelo.
```

**RAIO**
```
- Relâmpagos correndo pelo corpo e pelo machado; barba e cabelo arrepiados.
- Cores: azul-claro, branco, ciano, faíscas amarelas.
- Olhos branco-azulados com brilho.
- Golpes do machado com rastro de relâmpago.
```

**CIBORGUE**
```
- Armadura metálica por cima do viking: ombro, braço, peito e capacete com
  visor luminoso; fios, engrenagens e fumaça saindo do capacete. A barba ruiva
  continua aparecendo. Machado mecânico com lâmina brilhando.
- Cores: aço cinza-azulado, ciano elétrico, detalhes amarelos e vermelhos.
- Olhos: visor ciano brilhante.
- Golpes do machado com faíscas e arcos elétricos ciano.
```

---

## [MOVIMENTO]

**Transformação** (o Base não tem)
```
TRANSFORMAÇÃO em 6 quadros: 1) viking comum parado, 2) sinais do poder
começam a surgir, 3) o poder cresce no corpo, 4) pico: efeito máximo e olhos
acesos, 5) estabiliza, 6) pose de poder ativo, pronto para lutar.
```

**Parado**
```
PARADO (idle), 6 quadros em loop: respirando, o efeito do modo ondulando e
pulsando ao redor. O último quadro volta suavemente ao primeiro.
```

**Correr**
```
CORRENDO, 6 quadros em loop: ciclo de corrida completo, capa voando para
trás, o efeito do modo puxado para trás.
```

**Pulo**
```
PULO, 6 quadros: 1) agachar, 2) subir com o machado, 3) topo do pulo,
4) descer, 5) aterrissar com poeira, 6) levantar de pé.
```

**Ataque**
```
ATAQUE, 6 quadros: 1) preparar o machado atrás, 2) puxar com força,
3) golpe horizontal com arco largo do efeito do modo, 4) final do arco se
desfazendo em brasas, 5) recuperar, 6) voltar à posição parada.
O arco do quadro 3 tem que caber DENTRO do quadro.
```

**Giro 360°**
```
FURACÃO GIRATÓRIO 360°, 6 quadros: 1) agachar e enrolar o corpo, 2) começar
a girar com arco curto do efeito, 3) meio giro, círculo do efeito ao redor,
4) giro no ponto mais rápido, círculo quase completo, 5) fim do giro, arco
se desfazendo em brasas, 6) recuperar de pé. O círculo cabe DENTRO do quadro.
```

**Golpe vertical**
```
MACHADADA VERTICAL, 6 quadros: 1) agachar com o machado atrás, 2) levantar
o machado acima da cabeça, 3) ponto mais alto com o efeito no fio,
4) descer com força, arco de cima para baixo, 5) impacto no chão com faíscas,
6) recuperar de pé.
```

**Mergulho**
```
MERGULHO PESADO NO AR, 6 quadros: 1) no ar, corpo encolhido, 2) virando de
cabeça para baixo, machado apontado ao chão, 3) caindo com rastro do efeito
para cima, 4) quase tocando o chão, 5) IMPACTO: onda do efeito e poeira para
os lados, 6) levantar devagar. O impacto fica na altura do chão dos outros golpes.
```

**Arremesso**
```
ARREMESSO DO MACHADO, 6 quadros: 1) puxar o braço para trás com o machado,
2) tensão com o efeito no machado, 3) lançar: braço à frente, o machado sai
da mão com rastro, 4) braço estendido, mão VAZIA, 5) recuperar, mão vazia,
6) parado, mão vazia. Nos quadros 4 a 6 o viking fica SEM machado na mão.
```

**Disparo do poder** (sopro de fogo / raio / laser conforme o modo; o Base não tem)
```
DISPARO, 6 quadros: 1) postura de mira, 2) concentrar o efeito na mão ou no
machado, 3) o disparo sai horizontal para a direita, 4) disparo no máximo,
5) o disparo some, 6) recuperar. O disparo cabe DENTRO do quadro.
```

**Dano** (2 quadros)
```
LEVAR DANO, 2 quadros (em vez de 6): 1) corpo jogado para trás, expressão
de dor, efeito tremendo, 2) recuo máximo com um joelho dobrado.
```

---

## Poder próprio da Fúria (efeitos, sem personagem)

**Conjurar (com o viking)**: use o PROMPT BASE com este movimento:
```
CONJURAR EXPLOSÃO BERSERKER, 6 quadros: 1) respirar fundo, 2) agachar com
o fogo concentrando no machado, 3) levantar o machado com as duas mãos,
olhos mais brilhantes, 4) bater o machado no chão, explosão de fogo,
5) onda de fogo sai para a direita, 6) levantar, fogo volta ao normal.
```

**Onda de fogo**
```
Gere uma linha de sprite sheet de um EFEITO, sem personagem: uma ONDA DE
FOGO vermelha e laranja avançando para a direita rente ao chão, em pintura
2D com contorno escuro grosso, igual ao fogo do viking anexo. 6 quadros em
loop, fundo transparente, nada cruza a divisa dos quadros.
```

**Explosão**
```
Gere uma linha de sprite sheet de EFEITO, sem personagem: EXPLOSÃO DE FOGO
vista de lado em pintura 2D com contorno escuro grosso: 1) faísca, 2) bola
de fogo cresce, 3) explosão máxima, 4) abre em anel, 5) brasas caindo,
6) fumaça sumindo. Fundo transparente, 6 quadros, nada cruza a divisa.
```

**Runa (item)**
```
Gere uma sprite sheet de ITEM, sem personagem: uma RUNA VIKING de pedra com
símbolo de fogo brilhando em vermelho e laranja, flutuando e girando de
leve, estilo igual ao da runa do Raio anexa. 6 quadros em loop, fundo
transparente, runa centralizada e menor que o quadro.
```

**Ícone**
```
Gere UM ícone quadrado 256x256: um machado viking em chamas vermelhas e
laranjas dentro de um círculo de pedra rúnica, pintura 2D com contorno
escuro grosso, no estilo do viking anexo. Fundo transparente.
```
