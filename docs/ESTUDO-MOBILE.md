# Estudo: levar o Jogo Viking para o celular

Data: 2026-11-11. Baseado no código do commit `5ad14dc` e numa simulação de tela de celular.

**Conclusão:** dá para migrar sem reescrever o jogo. Canvas 2D roda bem em celular e o
código está separado o bastante (o teclado passa todo por `src/input.js`). O trabalho se
divide em quatro blocos. O maior **risco** é a **memória das imagens**, e o maior
**trabalho** são os **controles de toque**.

## O que foi testado

Simulação de celular deitado (844×390) e em pé (390×844), e leitura de todo o código de `src/`.

- **Deitado:** o painel de instruções cobre cerca de um terço da tela e o viking. O seletor
  "Forma" também invade o espaço.
- **Em pé:** o painel cobre a barra de vida e o mundo fica estreito, com o chão só na
  metade de baixo. Não serve. O jogo precisa ser **só deitado**.
- **Não foi possível medir o desempenho**, porque o painel de teste fica escondido e pausa
  a animação. Isso só se confirma num aparelho de verdade.

## O que precisa mudar, do mais arriscado ao menos

### 1. Memória das imagens (risco alto)

- `public/assets/viking-art.png` tem **1344 × 9632 px**, uns **49 MB** descompactado
  (258 quadros de 224 × 224, 96% com desenho).
- O jogo cria **4 cópias coloridas** dele na carga (branco, vermelho, azul, laranja, em
  `src/player.js` linhas 106 e 123–125). Só o viking ocupa então uns **250 MB**. O saxão
  tem mais 3 cópias, e o total passa de **280 MB**.
- Fúria e Fogo saíram do menu no commit `5ad14dc`, mas o código ainda cria as cópias deles.
- Muitos celulares limitam texturas a 4096 ou 8192 px, e a folha tem 9632 de altura. É um
  risco de travar ou ficar preto. Os limites exatos variam por aparelho: confirmar num
  celular.
- O download hoje é de uns 10 MB (`dist/`), e a folha do viking sozinha tem 5 MB.

**Solução:**
- dividir a folha em uma imagem por animação (até 2048 px de altura);
- criar as cópias coloridas só para o quadro que está na tela, em vez da folha inteira;
- converter as imagens para WebP;
- carregar só o que o jogo usa (há arquivos em `public/assets/` sem uso, como o cenário
  `fase1-bg-long.png`, enquanto `stage = null`).

### 2. Controles (trabalho maior, mas simples de entender)

Hoje o jogo só entende teclado. A solução é criar uma camada de **ações** (andar, atacar,
pular...) que o teclado e o toque alimentem. São cerca de 25 linhas em `src/player.js` e
`src/main.js`.

| Ação | Teclado hoje | No celular |
|---|---|---|
| Andar, 8 direções (inclui profundidade) | setas / WASD | joystick à esquerda |
| Correr | Shift segurado | joystick empurrado até o fim |
| Atacar, combo | J | botão grande à direita |
| Golpe vertical, giro, mergulho | W+J, S+J / Shift+J, J no ar | o mesmo botão, conforme o joystick e o estado |
| Pular (segurar = mais alto) | Espaço | botão |
| Esquiva | K / C | botão |
| Raio | L | botão (só com cargas) |
| Arremesso do machado, fogo | T, U | botões, se esses poderes continuarem no jogo |
| Trocar forma, pausar, recomeçar | 1/2, P / Esc, Enter | botões pequenos; tocar na tela de derrota |

- **Pegadinha:** o Shift hoje faz duas coisas, correr (segurado) e esquivar (toque, em
  `src/player.js` linha 243). Se o joystick "apertasse o Shift" ao correr, o viking
  esquivaria toda hora. É preciso uma ação própria de correr.
- Precisa de multitoque (andar e atacar juntos, com `pointerId` por dedo) e
  `touch-action: none`, para a tela não rolar nem dar zoom. Desligar também o menu de
  segurar (`-webkit-touch-callout: none`).
- O botão de pular precisa avisar quando é solto, porque a altura do pulo depende de
  segurar (`jumpHeld`).

### 3. Tela e layout (médio)

- Esconder o painel de instruções (`#hud`) e trocar o seletor de formas por um botão pequeno.
- Avisar "gire o celular" quando estiver em pé.
- `viewport-fit=cover` e `env(safe-area-inset-*)` para respeitar o entalhe.
- Limitar a resolução interna em telas muito densas (hoje até 2,5×, em `src/main.js`).
- Posições dos botões dentro das áreas seguras, longe das bordas.

### 4. Pequenos pontos (já estão bem ou são simples)

- O jogo já pausa ao sair do app (`blur` e `visibilitychange` em `src/main.js`), o que é
  ideal no celular.
- Não há som ainda; quando tiver, o celular só libera áudio depois do primeiro toque.
- O movimento usa o tempo real de cada quadro, então funciona em telas de 60 ou 120 Hz.
- Vibração (`navigator.vibrate`) só existe no Android. No iPhone, só dentro de app nativo.

## Caminhos de publicação

| Caminho | O que é | Prós / contras |
|---|---|---|
| **Site do celular (PWA)** | Abre no navegador e instala na tela inicial, em tela cheia | Mais barato, sem loja. No iPhone não trava a rotação nem vibra. |
| **App de loja (Capacitor)** | O mesmo jogo dentro de um app nativo | Trava deitado, vibra, entra na Play Store e na App Store. Contas: Google ~US$ 25 uma vez, Apple ~US$ 99/ano (valores de referência, confirmar nos sites). |
| **Reescrever (Godot, Unity)** | Jogo novo | Não recomendado: o código tem ~3.300 linhas que já funcionam e nada exige um motor novo. |

## Plano sugerido

1. **Controles de toque e layout:** camada de ações, botões, joystick, tela deitada. *Médio.*
2. **Memória e peso:** folhas divididas, cópias sob demanda, WebP. *Médio.*
3. **PWA:** manifesto, ícone, instalação, tela cheia deitada, funcionar sem internet. *Pequeno.*
4. **Lojas com Capacitor** (opcional, Android primeiro). *Médio.*

Depois dos passos 1 e 2, testar num celular real na mesma rede Wi-Fi:

```bash
npm run dev -- --host
```

Abrir no celular o endereço que o comando mostrar. É aí que se mede o desempenho de verdade.

## Limites deste estudo

- Desempenho real (quadros por segundo, calor, bateria) não foi medido.
- Os limites de memória e de tamanho de textura de cada aparelho foram citados de forma
  geral e precisam de confirmação em aparelhos reais (um iPhone e um Android simples).
- Os preços de contas de loja são de referência.
