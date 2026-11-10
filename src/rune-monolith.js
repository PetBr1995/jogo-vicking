// Nordic Thunder Rune Monolith (Runa de Raio)
// - Fica completamente parada (estática) quando o Viking está longe
// - Quando o Viking passa por cima dela, ela acorda e dispara toda a sequência:
//   1. Carga (runa brilha, faíscas azuis brotam)
//   2. Explosão de Raios (descarga violenta estalando eletricidade no Viking)
//   3. Dissipação (os raios recolhem de volta para a pedra)
//   4. Retorna a ficar parada e tranquila

export class ThunderMonolith {
  constructor(sheet, meta, scale, x, y) {
    this.sheet = sheet;
    this.meta = meta;
    this.scale = scale;
    this.x = x;
    this.y = y;
    this.z = 0;
    this.state = 'idle'; // 'idle' | 'activating'
    this.stage = 'idle'; // 'idle' | 'charge' | 'burst' | 'cooldown'
    this.row = 0;
    this.frame = 0;
    this.time = 0;
    this.cooldown = 0;
    this.discharged = false;
    this.onDischarge = null;
  }

  get cell() { return this.meta.cell; }
  get anchor() { return this.meta.anchor; }

  update(dt, player) {
    if (this.cooldown > 0) this.cooldown -= dt;

    if (this.state === 'idle') {
      // Completamente parada no quadro inicial da pedra
      this.row = 0;
      this.frame = 0;
      this.time = 0;
      this.discharged = false;

      // Ativa quando o Viking passa por ela (distância horizontal < 45px e alinhado)
      const nearX = Math.abs(player.x - this.x) < 46;
      const nearY = Math.abs(player.y - this.y) < 28;

      if (nearX && nearY && this.cooldown <= 0) {
        this.state = 'activating';
        this.stage = 'charge';
        this.row = 1; // Linha de carga
        this.frame = 0;
        this.time = 0;
      }
    } else if (this.state === 'activating') {
      this.time += dt;

      if (this.stage === 'charge') {
        // 6 quadros a 12 FPS (duração: 0.5s)
        const fps = 12;
        const f = Math.floor(this.time * fps);
        if (f < 6) {
          this.frame = f;
        } else {
          // Passa para a explosão de raios
          this.stage = 'burst';
          this.row = 2; // Linha de descarga violenta
          this.frame = 0;
          this.time = 0;
        }
      } else if (this.stage === 'burst') {
        // 6 quadros a 12 FPS
        const fps = 12;
        const f = Math.floor(this.time * fps);
        if (!this.discharged && f >= 2) {
          this.discharged = true;
          this.onDischarge?.(this, player);
        }
        if (f < 6) {
          this.frame = f;
        } else {
          // Passa para o resfriamento
          this.stage = 'cooldown';
          this.row = 3; // Linha de dissipação
          this.frame = 0;
          this.time = 0;
        }
      } else if (this.stage === 'cooldown') {
        // 6 quadros a 10 FPS
        const fps = 10;
        const f = Math.floor(this.time * fps);
        if (f < 6) {
          this.frame = f;
        } else {
          // Terminou a animação: volta a ficar parada e entra em pequeno cooldown
          this.state = 'idle';
          this.stage = 'idle';
          this.row = 0;
          this.frame = 0;
          this.time = 0;
          this.cooldown = 1.5;
        }
      }
    }
  }

  draw(ctx, debug) {
    const { cell, anchor } = this.meta;
    const s = this.scale;
    const src = [this.frame * cell, this.row * cell, cell, cell];

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(Math.round(this.x), Math.round(this.y));

    // Sombra suave sob a pedra
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 28 * s * 2.2, 8 * s * 1.8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Brilho no chão apenas quando ativada (charge ou burst)
    if (this.state === 'activating') {
      const isBurst = this.stage === 'burst';
      const r = (isBurst ? 55 : 35) * s * 2.0;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, isBurst ? 'rgba(140,230,255,0.7)' : 'rgba(80,180,255,0.4)');
      g.addColorStop(1, 'rgba(40,120,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Desenha a pedra
    ctx.scale(s, s);
    ctx.drawImage(this.sheet, ...src, -anchor.x, -anchor.y, cell, cell);

    if (debug) {
      ctx.strokeStyle = '#0ff';
      ctx.lineWidth = 1 / s;
      ctx.strokeRect(-anchor.x, -anchor.y, cell, cell);
    }

    ctx.restore();
    ctx.imageSmoothingEnabled = false;
  }
}
